from fastapi import APIRouter, Body
from backend.app.services.whatif import whatif_service
from backend.app.models.schemas import WhatIfRequest, WhatIfResponse

router = APIRouter(prefix="/whatif", tags=["What-If Simulator"])

@router.post("", response_model=WhatIfResponse)
def evaluate_whatif_scenario(request: WhatIfRequest = Body(...)):
    """
    Simulates counterfactual flood risk under modified rainfall multipliers
    and stormwater drainage blockage percentages.
    """
    return whatif_service.evaluate(request)
