import React, { useEffect, useState } from 'react';
import {
  Play,
  Pause,
  FastForward,
  RotateCcw,
  SlidersHorizontal,
  CloudRain,
  Radio,
  Clock,
  Globe2
} from 'lucide-react';
import { useSimulationStore } from '../store/useSimulationStore';
import { controlSimulation, fetchScenarios } from '../services/api';
import { ScenarioItem } from '../types';

export const Header: React.FC = () => {
  const {
    simulationState,
    selectedScenarioId,
    playbackSpeed,
    isPlaying,
    timezoneMode,
    wsConnected,
    isWhatIfOpen,
    setIsWhatIfOpen,
    setTimezoneMode,
    setSelectedScenarioId,
    setPlaybackSpeed,
    setIsPlaying
  } = useSimulationStore();

  const [scenarios, setScenarios] = useState<ScenarioItem[]>([]);

  useEffect(() => {
    fetchScenarios()
      .then((res) => {
        if (res && res.scenarios) {
          setScenarios(res.scenarios);
        }
      })
      .catch(() => {});
  }, []);

  const handleTogglePlay = async () => {
    const action = isPlaying ? 'pause' : 'play';
    setIsPlaying(!isPlaying);
    try {
      await controlSimulation({ action });
    } catch {
      // Graceful fallback
    }
  };

  const handleSpeedChange = async (speed: number) => {
    setPlaybackSpeed(speed);
    try {
      await controlSimulation({ action: 'set_speed', speed });
    } catch {
      // Graceful fallback
    }
  };

  const handleScenarioChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScId = e.target.value;
    setSelectedScenarioId(newScId);
    try {
      await controlSimulation({ action: 'set_scenario', scenario_id: newScId });
    } catch {
      // Graceful fallback
    }
  };

  const handleSeek = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekSec = parseFloat(e.target.value);
    try {
      await controlSimulation({ action: 'seek', seek_seconds: seekSec });
    } catch {
      // Graceful fallback
    }
  };

  // Format virtual time
  const simDate = simulationState?.current_time ? new Date(simulationState.current_time) : new Date();
  const timeFormatted =
    timezoneMode === 'IST'
      ? simDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : simDate.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  const dateFormatted =
    timezoneMode === 'IST'
      ? simDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', year: 'numeric' })
      : simDate.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });

  const maxSeekSeconds = (simulationState?.total_duration_hours || 24) * 3600;
  const currentElapsed = simulationState?.elapsed_seconds || 0;

  return (
    <header className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 z-40 backdrop-blur-md shrink-0">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        {/* Left: Branding & Status */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <CloudRain className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg text-white tracking-tight">FloodShield</h1>
              <span className="text-[10px] bg-cyan-500/10 text-cyan-400 font-semibold px-2 py-0.5 rounded-full border border-cyan-500/20">
                v2.0 Operations
              </span>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <span>Delhi NCR Early Warning System</span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400 font-mono text-[11px]">500m Grid</span>
            </p>
          </div>
        </div>

        {/* Center: Simulation Clock & Playback Slider */}
        <div className="flex-1 max-w-2xl px-2">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleTogglePlay}
                  className={`p-1.5 rounded-lg transition-colors flex items-center justify-center ${
                    isPlaying
                      ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                      : 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-bold'
                  }`}
                  title={isPlaying ? 'Pause Simulation' : 'Play Simulation'}
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                </button>

                {/* Speed buttons */}
                <div className="flex items-center bg-slate-900 rounded-lg p-0.5 border border-slate-800 text-[11px] font-mono">
                  {[1, 10, 60].map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSpeedChange(s)}
                      className={`px-2 py-0.5 rounded ${
                        playbackSpeed === s
                          ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>

                {/* Time readout */}
                <div className="flex items-center gap-1.5 text-slate-300 font-mono text-xs pl-2">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold text-white">{timeFormatted}</span>
                  <span className="text-slate-400 text-[11px]">({timezoneMode})</span>
                  <span className="text-slate-500 text-[11px]">· {dateFormatted}</span>
                </div>
              </div>

              {/* Timezone toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTimezoneMode(timezoneMode === 'IST' ? 'UTC' : 'IST')}
                  className="text-[11px] text-slate-400 hover:text-cyan-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded"
                >
                  {timezoneMode === 'IST' ? 'Switch to UTC' : 'Switch to IST'}
                </button>
              </div>
            </div>

            {/* Time scrub slider */}
            <div className="flex items-center gap-2 pt-0.5">
              <span className="text-[10px] text-slate-500 font-mono">T0</span>
              <input
                type="range"
                min={0}
                max={maxSeekSeconds}
                step={300}
                value={currentElapsed}
                onChange={handleSeek}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-[10px] text-slate-500 font-mono">
                +{(simulationState?.total_duration_hours || 24)}h
              </span>
            </div>
          </div>
        </div>

        {/* Right: Scenario, What-If & WS Status */}
        <div className="flex items-center gap-2.5">
          {/* Scenario Selector */}
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-mono text-slate-400 tracking-wider">Atmospheric Scenario</span>
            <select
              value={selectedScenarioId}
              onChange={handleScenarioChange}
              className="bg-slate-950 border border-slate-800 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-cyan-500 font-medium"
            >
              {scenarios.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </div>

          {/* What-If simulator trigger button */}
          <button
            onClick={() => setIsWhatIfOpen(!isWhatIfOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              isWhatIfOpen
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/50'
                : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
            <span>What-If</span>
          </button>

          {/* WebSocket Pulse */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono ${
              wsConnected
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            }`}
            title={wsConnected ? 'Connected to live simulation feed' : 'Reconnecting to live feed...'}
          >
            <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[11px] font-medium">{wsConnected ? 'LIVE' : 'SYNCING'}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
