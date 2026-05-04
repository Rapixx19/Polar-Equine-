from fastapi import FastAPI

from algorithms.version import algo_version
from service.routes.compute import router as compute_router
from service.routes.recompute import router as recompute_router

app = FastAPI(title="La Fattoria algo", version=algo_version)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "algo_version": algo_version}


app.include_router(compute_router)
app.include_router(recompute_router)
