from student.utils.supabase_utils import supabase
from student.core.groq_service import GroqService
from student.core.whisper_service import WhisperService
from student.core.report_service import ReportService
from fastapi import Depends

def get_supabase():
    return supabase

def get_groq_service():
    return GroqService()

def get_whisper_service():
    return WhisperService()

def get_report_service(supabase=Depends(get_supabase), groq_service=Depends(get_groq_service)):
    return ReportService(supabase=supabase, groq_service=groq_service)