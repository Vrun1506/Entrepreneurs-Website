from fastapi import FastAPI

app = FastAPI()

@app.get("/health")
async def get_health():
    return {"status": "ok"}

@app.post("/cv-store")
async def store_cv():
    # Check the file type and size
    # Check the file contents
    # Remove any whitespace or special characters to avoid any kind of prompt injections and things
    # Store the file in an Azure Blob storage container
    pass


@app.get("/cv-retrieve")
async def retrieve_cv():
    # Retrieve the file from the Azure Blob storage container
    # Return the file to the user on the profile page (in case they might wanna view it or download it)
    pass


def embed_cv():
    # Use OpenAI's embedding API to generate embeddings for the CV
    # Store the embeddings in a vector database for later retrieval
    pass

def rerank():
    # Retrieve the most relevant candidates and rerank based off the job description and their actual CVs. 