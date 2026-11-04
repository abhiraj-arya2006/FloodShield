"""The Ask panel: built-in answers come from the data, and Claude gets that same data."""
from fastapi.testclient import TestClient

from app.backend import ask
from app.backend.main import app

client = TestClient(app)
# 0, 3, 10, then 21 gauges on warning over these four days.
BASE = {"start": "2013-07-09", "day": 4}


def post(question, **extra):
    return client.post("/api/ask", json={**BASE, "question": question, **extra})


def forecast_rows(day=4):
    target = f"2013-07-{9 + day}"
    return client.get(f"/api/forecast?date={target}&lead={day}").json()["gauges"]


def test_without_a_key_answers_are_built_in(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    res = post("Which gauges are on warning?")
    assert res.status_code == 200
    assert res.headers["x-answered-by"] == "built-in"
    assert res.text.startswith("21 gauges are on warning on day 4 (2013-07-13)")
    for gauge in forecast_rows():
        assert (gauge["name"] in res.text) or gauge["status"] != "WARNING"


def test_named_gauge_answer_uses_its_real_numbers(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    polavaram = next(g for g in forecast_rows() if g["name"] == "Polavaram")
    text = post("What about Polavaram?").text
    assert f"{polavaram['predicted_m3s']:,.0f}" in text
    assert f"{polavaram['warning_m3s']:,.0f}" in text


def test_open_gauge_is_used_for_this_gauge(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert "Polavaram" in post("Why is this gauge flagged?", gauge_id="03075").text


def test_general_questions_are_not_about_the_open_gauge(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    highest = max(forecast_rows(), key=lambda g: g["predicted_m3s"] / g["q95_m3s"])
    answer = post("Which gauge is highest?", gauge_id="03075").text
    assert answer.startswith(f"Relative to its own high-flow level, {highest['name']}")
    assert "74%" in post("How accurate is it?", gauge_id="03075").text


def test_accuracy_quotes_the_test_scores(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    text = post("How accurate is the model?").text
    assert "74%" in text and "38%" in text and "0.62" in text


def test_hindi_answers(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert "चेतावनी" in post("कौन से गेज चेतावनी पर हैं?", lang="hi").text


def test_unknown_question_says_what_it_can_do(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert "API key" in post("What should I eat?").text


def test_bad_requests_are_rejected():
    assert post("").status_code == 422
    assert post("x" * 501).status_code == 422
    assert post("hi", start="not-a-date").status_code == 400
    assert client.post("/api/ask", json={"question": "hi", "start": "2012-12-28", "day": 1}).status_code == 404


def test_rate_limit():
    limiter = ask.RateLimiter(limit=2, window_seconds=60)
    assert limiter.allow("a") and limiter.allow("a")
    assert not limiter.allow("a")
    assert limiter.allow("b")


class FakeStream:
    text_stream = ["Twenty-one ", "gauges."]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return type("Final", (), {"stop_reason": "end_turn"})()


class FakeClient:
    def __init__(self):
        self.calls = []
        self.beta = type("Beta", (), {"messages": self})()

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return FakeStream()


def test_claude_receives_the_forecast_and_streams_back(monkeypatch):
    fake = FakeClient()
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(ask, "_get_client", lambda: fake)
    res = post("Which gauges are on warning?", history=[{"role": "assistant", "content": "ignored"}, {"role": "user", "content": "hello"}])
    assert res.headers["x-answered-by"] == "claude"
    assert res.text == "Twenty-one gauges."
    call = fake.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["messages"][0] == {"role": "user", "content": "hello"}  # History must start with the user.
    content = call["messages"][-1]["content"]
    assert "Day 4 (2013-07-13): 21 warnings" in content
    assert "Polavaram" in content
    assert content.endswith("Which gauges are on warning?")


def test_claude_failure_falls_back_to_built_in(monkeypatch):
    import anthropic

    class Broken:
        beta = type("Beta", (), {"messages": type("M", (), {"stream": staticmethod(lambda **k: (_ for _ in ()).throw(anthropic.APIError("down", None, body=None)))})()})()

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    monkeypatch.setattr(ask, "_get_client", lambda: Broken())
    text = post("Which gauges are on warning?").text
    assert text.startswith("21 gauges are on warning")
    assert "built-in answer" in text
