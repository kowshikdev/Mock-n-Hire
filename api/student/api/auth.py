from fastapi import Header, HTTPException, Depends

from student.utils.supabase_utils import supabase

# Was: no auth dependency existed on any interview/stress/admin route in this
# backend at all -- mock_user_id/session_id path params were only checked
# for UUID format, never for ownership. Any client could read or write any
# other user's interview data by editing the URL. supabase.auth.get_user()
# verifies the token against Supabase Auth itself (real signature + expiry
# check); require_self/require_session_owner/require_recruiter then check
# that the authenticated caller actually owns the resource in the URL,
# which a bare "is this JWT valid" check does not do on its own.


def get_current_user(authorization: str = Header(...)) -> dict:
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
    return {"user_id": result.user.id, "email": result.user.email, "role": role}


def require_self(mock_user_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """The mock_user_id in the URL must match the authenticated caller --
    otherwise a valid token for user A could still read/write user B's
    interview data just by editing the URL."""
    if mock_user_id != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized for this user")
    return current_user


def require_session_owner(session_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """Routes keyed by session_id (not mock_user_id directly) need the
    owning user looked up from mock_interview_sessions before it can be
    compared to the authenticated caller."""
    session = (
        supabase.table("mock_interview_sessions")
        .select("user_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    if not session.data or session.data["user_id"] != current_user["user_id"]:
        raise HTTPException(status_code=403, detail="Not authorized for this session")
    return current_user


def require_recruiter(current_user: dict = Depends(get_current_user)) -> dict:
    """Admin routes (list/delete any session) need a real role check, not
    just "any authenticated user" -- role comes from the same signup-time
    value api_service.py's get_current_user reads for the recruiter side."""
    if current_user.get("role") != "recruiter":
        raise HTTPException(status_code=403, detail="Recruiter role required")
    return current_user
