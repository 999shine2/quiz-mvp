#!/usr/bin/env python3
import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

def fetch_transcript(video_id):
    languages = [
        'en', 'en-US', 'en-GB', 
        'vi', 'ko', 'ja', 
        'zh-Hans', 'zh-Hant', 'zh', 
        'es', 'fr', 'de', 'pt', 'hi', 'ar', 
        'ru', 'it', 'id', 'tr', 'nl', 'pl', 'sv'
    ]
    try:
        api = YouTubeTranscriptApi()
        transcript_list = api.list(video_id)
        
        transcript = None
        
        # 1. Try manual English
        try:
             transcript = transcript_list.find_transcript(['en', 'en-US'])
        except:
             pass
             
        # 2. Try any of our preferred languages (manual)
        if not transcript:
            try:
                transcript = transcript_list.find_transcript(languages)
            except:
                pass
        
        # 3. Try auto-generated (any language)
        if not transcript:
            try:
                for t in transcript_list:
                    if t.is_generated:
                        transcript = t
                        break
            except:
                pass
                
        # 4. Fallback: Take ANYTHING
        if not transcript:
            for t in transcript_list:
                transcript = t
                break
                
        if not transcript:
            raise Exception("No transcripts found")
            
        data = transcript.fetch()
        
        # Check if data is list of dicts (old) or objects (new)
        # Based on error, it's objects. But let's be safe?
        # No, let's assume objects because we are on 1.2.3
        
        full_text_parts = []
        for item in data:
            if hasattr(item, 'text'):
                full_text_parts.append(item.text)
            elif isinstance(item, dict) and 'text' in item:
                full_text_parts.append(item['text'])
            else:
                # Fallbackstr
                full_text_parts.append(str(item))

        full_text = ' '.join(full_text_parts)
        
        result = {
            'success': True,
            'text': full_text,
            'segments': len(data),
            'language': transcript.language_code
        }
        print(json.dumps(result))

    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e)
        }
        print(json.dumps(error_result))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
        fetch_transcript(video_id)
    else:
        print(json.dumps({'success': False, 'error': 'No video ID provided'}))
