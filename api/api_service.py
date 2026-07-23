# File: api_service.py

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn
import os
import shutil
import json
import uuid
import io
import csv
import mimetypes
from dotenv import load_dotenv
from supabase import create_client
from typing import Optional

from process_resumes import process_all_resumes
from rank_candidates import compute_relative_ranking
from routes.collaboration import router as collaboration_router
from routes.search_analytics import router as search_router

# ─── Load & init ─────────────────────────────────────────
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Supabase credentials not found!")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # or ["*"] for all, but dev only
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: routes/comparison.py was a near-duplicate of routes/search_analytics.py
# -- both mounted /compare-candidates, /history, /export, a real route
# collision. comparison.py was removed; search_router keeps the better /export
# (it sets a Content-Disposition download filename).
app.include_router(collaboration_router)
app.include_router(search_router)

# ─── Paths ───────────────────────────────────────────────
RESUME_FOLDER         = "resumes"
UPLOAD_FOLDER         = "uploads"
PROCESSED_DATA_FOLDER = "processed_data"
for d in (RESUME_FOLDER, UPLOAD_FOLDER, PROCESSED_DATA_FOLDER):
    os.makedirs(d, exist_ok=True)

# ─── Auth helper ─────────────────────────────────────────
# Was: jwt.decode(token, options={"verify_signature": False}) -- the
# signature was never checked, so any caller could forge a token claiming
# to be any user_id, and every valid-looking token was treated as a
# recruiter regardless of who actually signed up. supabase.auth.get_user()
# calls Supabase Auth's own verification (signature + expiry), and role
# comes from the real value set at signup (lib/auth.ts's signUp() writes
# role into both the users table and the auth user's user_metadata).
def get_current_user(authorization: str = Header(...)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        result = supabase.auth.get_user(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not result or not result.user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = (result.user.user_metadata or {}).get("role")
    return {"user_id": result.user.id, "role": role}

# ─── Job status ──────────────────────────────────────────
def insert_job_status(job_id: str):
    try:
        supabase.table("job_status").insert({"job_id": job_id, "status": "pending"}).execute()
    except Exception as e:
        print("⚠️ insert_job_status:", e)

def update_job_status(job_id: str):
    try:
        print(f"🌀 Attempting to update job status to COMPLETE for {job_id}")
        supabase.table("job_status").update({"status": "complete"}).eq("job_id", job_id).execute()
        print(f"✅ Job status marked COMPLETE → {job_id}")
    except Exception as e:
        print("⚠️ update_job_status:", e)

# ─── DB uploads ──────────────────────────────────────────
def upload_job_description_to_db(job_id, title, desc, exp_w, proj_w, user_id):
    try:
        supabase.table("job_descriptions").insert({
            "job_id":             job_id,
            "user_id":            user_id,
            "job_title":          title,
            "job_description":    desc,
            "experience_weight":  exp_w,
            "project_weight":     proj_w
        }).execute()
    except Exception as e:
        print("⚠️ upload_job_description_to_db:", e)

def upload_resume_info_to_db(file_name: str, file_path: str, job_id: str, user_id: str):
    resume_id = str(uuid.uuid4())
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
    except Exception as e:
        print(f"🚨 Could not open {file_path}: {e}")
        return None

    content_type, _ = mimetypes.guess_type(file_path)
    if not isinstance(content_type, str) or not content_type:
        content_type = "application/octet-stream"

    storage_path = f"{job_id}/{file_name}"
    try:
        print("📤 Uploading to Supabase Storage...", {
            "storage_path": storage_path,
            "content_type": content_type,
            "size": len(file_content)
        })
        supabase.storage.from_("resumes").upload(
            path=storage_path,
            file=file_content,
            file_options={"content-type": content_type},
        )
    except Exception as e:
        print(f"🚨 Storage upload failed for {file_name}: {e}")
        return None

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/resumes/{storage_path}"

    try:
        supabase.table("resume_uploads").insert({
            "resume_id":  resume_id,
            "user_id":    user_id,
            "job_id":     job_id,
            "file_name":  file_name,
            "file_path":  public_url
        }).execute()
        print(f"✅ INSERTED resume_uploads → resume_id={resume_id}, file_name={file_name}")
    except Exception as e:
        print(f"🚨 Error inserting into resume_uploads for {file_name}: {e}")
        return None

    try:
        os.remove(file_path)
    except Exception as e:
        print(f"⚠️ Failed to delete local file {file_path}: {e}")

    return resume_id

def upload_analysis_to_db(resume_id_map, job_id: str):
    """
    Reads the local {job_id}_analysis.json and inserts EVERY analysis entry
    into resume_analysis, regardless of zero scores.
    """
    fn = os.path.join(PROCESSED_DATA_FOLDER, f"{job_id}_analysis.json")
    if not os.path.exists(fn):
        print("⚠️ Analysis file missing:", fn)
        return

    with open(fn) as f:
        results = json.load(f)

    print("\n📦 Available keys in resume_id_map:")
    print(list(resume_id_map.keys()))
    print("📖 Uploading all analysis entries:")

    for entry in results:
        raw_filename = entry.get("filename", "")
        lookup_name  = raw_filename.strip().lower()
        resume_id    = resume_id_map.get(lookup_name)

        if not resume_id:
            print(f"🚫 No resume_id for {lookup_name} (original: {raw_filename})")
            continue

        analysis = entry.get("analysis", {})
        # Build payload with correct key names
        payload = {
            "resume_id":                  resume_id,
            "key_skills":                 analysis.get("Key Skills", []),
            "overall_analysis":           analysis.get("Overall Analysis", ""),
            "certifications_courses":     analysis.get("Certifications & Courses", []),
            "relevant_projects":          analysis.get("Relevant Projects", []),
            "soft_skills":                analysis.get("Soft Skills", []),
            "overall_match_score":        analysis.get("Overall Match Score", 0),
            "projects_relevance_score":   analysis.get("Projects Relevance Score", 0),
            "experience_relevance_score": analysis.get("Experience Relevance Score", 0)
        }

        try:
            # Remove any old row, then insert fresh
            supabase.table("resume_analysis").delete().eq("resume_id", resume_id).execute()
            supabase.table("resume_analysis").insert(payload).execute()
            print(f"✅ Uploaded analysis for: {lookup_name}")
        except Exception as e:
            print(f"🚨 upload_analysis_to_db error ({lookup_name}): {e}")

# ─── Background work ─────────────────────────────────────
def background_process(zip_path, job_description, weightages, out_folder, job_id, user_id):
    try:
        results, resume_id_map = process_all_resumes(
            zip_path, job_description, weightages, out_folder, job_id, user_id
        )
        print("📦 Passing keys to upload_analysis_to_db:", list(resume_id_map.keys()))
        upload_analysis_to_db(resume_id_map, job_id)
        compute_relative_ranking(job_id)
    except Exception as e:
        print("🚨 Background processing error:", e)
    finally:
        try:
            update_job_status(job_id)
            print(f"✅ Job status marked complete → {job_id}")
        except Exception as e:
            print("⚠️ update_job_status failed:", e)

# ─── API endpoints ───────────────────────────────────────
@app.post("/upload-resumes/")
async def upload_resumes(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    job_description: str = Form(...),
    job_title: str       = Form(...),
    weight_experience: int = Form(...),
    weight_projects:    int = Form(...),
    user=Depends(get_current_user)
):
    if user["role"] != "recruiter":
        raise HTTPException(403, "Only recruiters can upload.")

    job_id     = str(uuid.uuid4())
    user_id    = user["user_id"]
    zip_path   = os.path.join(UPLOAD_FOLDER, f"{job_id}.zip")
    out_folder = os.path.join(RESUME_FOLDER, job_id)
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(out_folder, exist_ok=True)

    with open(zip_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)
    if os.path.getsize(zip_path) == 0:
        raise HTTPException(400, "Uploaded file is empty.")

    upload_job_description_to_db(job_id, job_title, job_description,
                                 weight_experience, weight_projects, user_id)
    insert_job_status(job_id)

    weight_map = {"experience": weight_experience, "projects": weight_projects}
    background_tasks.add_task(
        background_process, zip_path, job_description,
        weight_map, out_folder, job_id, user_id
    )

    return {"job_id": job_id}

@app.get("/status")
async def get_status(job_id: str):
    resp = supabase.table("job_status").select("status").eq("job_id", job_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(404, "Job ID not found.")
    return {"status": resp.data[0]["status"]}

@app.get("/export")
async def export_results(job_id: str, format: str = "json"):
    jrank = os.path.join(PROCESSED_DATA_FOLDER, f"{job_id}_ranked_candidates.json")
    janal = os.path.join(PROCESSED_DATA_FOLDER, f"{job_id}_analysis.json")
    file_path = jrank if os.path.exists(jrank) else janal

    if not file_path:
        raise HTTPException(500, "No results to export.")

    if format.lower() == "json":
        data = [r for r in json.load(open(file_path)) if r.get("filename") and r.get("analysis")]
        return JSONResponse(content=data)

    if format.lower() == "csv":
        arr = json.load(open(file_path))
        stream = io.StringIO()
        writer = None
        for item in arr:
            row = {"filename": item["filename"], **item["analysis"]}
            if writer is None:
                writer = csv.DictWriter(stream, fieldnames=row.keys())
                writer.writeheader()
            writer.writerow(row)
        stream.seek(0)
        return StreamingResponse(stream, media_type="text/csv")

    raise HTTPException(400, "Unsupported format.")

@app.get("/resumes/{job_id}/{filename}")
def get_resume_url(job_id: str, filename: str):
    url = f"{SUPABASE_URL}/storage/v1/object/public/resumes/{job_id}/{filename}"
    return {"url": url}

@app.post("/update-status/")
async def update_resume_status(
    job_id: str = Form(...),
    resume_id: str = Form(...),
    status: str = Form(...),
    user=Depends(get_current_user)
):
    if user["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Only recruiters can update status.")

    try:
        supabase.table("resume_rankings") \
            .update({"status": status}) \
            .eq("job_id", job_id) \
            .eq("resume_id", resume_id) \
            .execute()
        return {"message": f"Status updated to {status}"}
    except Exception as e:
        print("🚨 Error in /update-status/:", e)
        raise HTTPException(status_code=500, detail="Could not update resume status")

@app.post("/add-note/")
async def add_recruiter_note(
    job_id: str = Form(...),
    resume_id: str = Form(...),
    notes: Optional[str] = Form(None),
    tagged_users: Optional[str] = Form(None),
    user=Depends(get_current_user)
):
    if user["role"] != "recruiter":
        raise HTTPException(status_code=403, detail="Only recruiters can add notes.")

    update_payload = {}
    if notes is not None:
        update_payload["notes"] = notes
    if tagged_users is not None:
        update_payload["tagged_users"] = tagged_users.split(",")

    if not update_payload:
        raise HTTPException(status_code=400, detail="No update payload provided.")

    try:
        supabase.table("resume_rankings") \
            .update(update_payload) \
            .eq("job_id", job_id) \
            .eq("resume_id", resume_id) \
            .execute()
        return {"message": "Notes and tags updated successfully"}
    except Exception as e:
        print("🚨 Error in /add-note/:", e)
        raise HTTPException(status_code=500, detail="Failed to update notes or tags")

if __name__ == "__main__":
    # Railway (and most PaaS hosts) inject the port to bind via $PORT --
    # hardcoding 8000 would silently fail to bind to the port Railway
    # actually routes traffic to.
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
