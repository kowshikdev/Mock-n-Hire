from fastapi import Depends

from student.core.groq_service import GroqService
from student.core.report_service import ReportService
from student.core.resume_parser import ResumeParser
from student.core.tts_service import TTSService
from student.core.whisper_service import WhisperService
from student.utils.supabase_utils import supabase


def get_supabase():
    return supabase

def get_groq_service():
    return GroqService()

def get_tts_service():
    return TTSService()

def get_whisper_service():
    return WhisperService()

def get_report_service(supabase=Depends(get_supabase), groq_service=Depends(get_groq_service)):
    return ReportService(supabase=supabase, groq_service=groq_service)

def get_resume_parser(supabase=Depends(get_supabase), groq_service=Depends(get_groq_service)):
    return ResumeParser(supabase=supabase, groq_service=groq_service)
