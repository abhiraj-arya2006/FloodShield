import abc
from typing import Dict, List, Optional, Any
from backend.app.models.schemas import ZoneStatic, Alert

class AbstractRepository(abc.ABC):
    """Abstract database repository interface (prepared for PostGIS swap in Milestone 2)."""
    @abc.abstractmethod
    def get_zone(self, zone_id: str) -> Optional[ZoneStatic]:
        pass

    @abc.abstractmethod
    def list_zones(self) -> List[ZoneStatic]:
        pass

    @abc.abstractmethod
    def get_alert(self, alert_id: str) -> Optional[Alert]:
        pass

    @abc.abstractmethod
    def list_alerts(self, limit: int = 50) -> List[Alert]:
        pass

    @abc.abstractmethod
    def save_alert(self, alert: Alert) -> None:
        pass

class InMemoryRepository(AbstractRepository):
    """Milestone 1 in-memory repository implementation."""
    def __init__(self):
        self._zones: Dict[str, ZoneStatic] = {}
        self._alerts: Dict[str, Alert] = {}

    def init_zones(self, zones: List[ZoneStatic]):
        self._zones = {z.zone_id: z for z in zones}

    def get_zone(self, zone_id: str) -> Optional[ZoneStatic]:
        return self._zones.get(zone_id)

    def list_zones(self) -> List[ZoneStatic]:
        return list(self._zones.values())

    def get_alert(self, alert_id: str) -> Optional[Alert]:
        return self._alerts.get(alert_id)

    def list_alerts(self, limit: int = 50) -> List[Alert]:
        alerts = list(self._alerts.values())
        alerts.sort(key=lambda a: a.timestamp, reverse=True)
        return alerts[:limit]

    def save_alert(self, alert: Alert) -> None:
        self._alerts[alert.id] = alert

repository = InMemoryRepository()
