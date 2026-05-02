from fastapi import Depends, FastAPI

from algorithms.version import algo_version
from service.auth import require_bearer

app = FastAPI(title="La Fattoria algo", version=algo_version)


@app.get("/health", dependencies=[Depends(require_bearer)])
def health() -> dict[str, str]:
    return {"status": "ok", "algo_version": algo_version}
