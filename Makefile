# FloodGuard AI - Development & Operations Makefile

.PHONY: help setup dev test lint seed train-synthetic clean

help:
	@echo "Available commands:"
	@echo "  make setup            - Install dependencies for backend and frontend"
	@echo "  make dev              - Start backend and frontend development servers"
	@echo "  make test             - Run backend and frontend test suites"
	@echo "  make lint             - Run linting and type checks"
	@echo "  make seed             - Pre-generate deterministic grid and terrain caches"
	@echo "  make train-synthetic  - Train XGBoost baseline on synthetic scenario data"
	@echo "  make clean            - Remove cached artifacts and temporary files"

setup:
	python -m pip install -r requirements.txt
	cd frontend && npm install

dev:
	@echo "Starting FloodGuard AI backend and frontend..."
	python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	pytest backend/tests
	cd frontend && npm test -- --run

lint:
	python -m ruff check backend ml
	python -m mypy backend ml
	cd frontend && npm run lint

seed:
	python -m backend.app.simulation.seed

train-synthetic:
	python -m scripts.train_synthetic

clean:
	rm -rf .pytest_cache __pycache__ backend/app/__pycache__
	rm -rf frontend/dist frontend/node_modules/.vite
