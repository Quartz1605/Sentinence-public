import asyncio
import os
from dotenv import load_dotenv

# Ensure the .env file is loaded so OPENROUTER_API_KEY is available
load_dotenv()

from app.interviews.contradiction import detect_contradiction

async def main():
    # Example past statements
    memory = """Q: Tell me about yourself and your experience relevant to this role.
A: I have over 5 years of experience building scalable backend systems in Python and Node.js.

Q: Describe a challenging project you worked on and how you approached it.
A: I built a microservices architecture that handled thousands of requests per second. I'm very comfortable with complex system design."""

    # Contradictory new statement
    current_input = "To be honest, I'm mostly a frontend developer and haven't worked much with backends or system design."

    print("Running contradiction detection...")
    print(f"Model used: google/gemini-2.0-flash-lite-001 (Google Gemini 2.0 Flash Lite)")
    print("-" * 50)
    print("Memory:\n" + memory)
    print("-" * 50)
    print("New statement:\n" + current_input)
    print("-" * 50)
    
    result = await detect_contradiction(memory, current_input)
    
    print("Result:")
    import json
    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
