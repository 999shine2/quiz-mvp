
import sys
try:
    from youtube_transcript_api import YouTubeTranscriptApi
    print("Library imported successfully", file=sys.stderr)
    print(f"Attributes: {dir(YouTubeTranscriptApi)}", file=sys.stderr)
    print(f"Static get_transcript: {hasattr(YouTubeTranscriptApi, 'get_transcript')}", file=sys.stderr)
    print(f"Static list_transcripts: {hasattr(YouTubeTranscriptApi, 'list_transcripts')}", file=sys.stderr)
    
    # Try instantiating
    try:
        api = YouTubeTranscriptApi()
        print(f"Instance attributes: {dir(api)}", file=sys.stderr)
    except Exception as e:
        print(f"Cannot instantiate: {e}", file=sys.stderr)

except ImportError:
    print("Library not found", file=sys.stderr)
