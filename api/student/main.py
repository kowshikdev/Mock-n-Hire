import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.routes import interview, stress, admin
from dotenv import load_dotenv
load_dotenv()
app = FastAPI()

# Allow localhost and 127.0.0.1 (covers all dev browsers)
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    # Add your deployed frontend domain here when ready:
    # "https://your-frontend.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add routers
app.include_router(interview.router)
app.include_router(stress.router)
app.include_router(admin.router)

if __name__ == "__main__":
    # This file had no entry point at all before -- Railway's Railpack build
    # system falls back to `python main.py` when it can't detect a framework
    # start command, which would previously do nothing (import the app,
    # start no server). Also binds $PORT, which Railway injects dynamically
    # rather than a fixed port.
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8001)))
