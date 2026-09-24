import React, { useState } from 'react';
import { History, Calendar, Filter, CloudRain, AlertTriangle, ArrowUpRight } from 'lucide-react';

const HISTORICAL_EVENTS = [
  {
    id: 'EVT-2023-YAMUNA',
    name: 'July 2023 Extreme Yamuna Surge',
    date: 'July 13, 2023',
    type: 'COMPOUND',
    peakRain_mm: 153.0,
    riverLevel_m: 208.66,
    affectedZones: 142,
    severity: 'EXTREME',
    description: 'Historical peak Yamuna level breaching 208.66m combined with severe drainage backflow at Ring Road, ITO, and Red Fort lowlands.'
  },
  {
    id: 'EVT-2022-GURUGRAM',
    name: 'September 2022 Gurugram Waterlogging',
    date: 'Sept 22, 2022',
    type: 'PLUVIAL',
    peakRain_mm: 88.5,
    riverLevel_m: 203.20,
    affectedZones: 86,
    severity: 'SEVERE',
    description: 'Intense 3-hour localized pluvial downpour choking Badshahpur drain corridor, submerging Golf Course Extension and Subhash Chowk underpasses.'
  },
  {
    id: 'EVT-2021-AIRPORT',
    name: 'September 2021 IGI Airport Forecourt Flood',
    date: 'Sept 11, 2021',
    type: 'PLUVIAL',
    peakRain_mm: 112.0,
    riverLevel_m: 203.80,
    affectedZones: 64,
    severity: 'SEVERE',
    description: 'Record morning cloudburst overwhelming airside stormwater evacuation pumping systems at Terminal 3 and Dwarka underpasses.'
  },
  {
    id: 'EVT-2019-MONSOON',
    name: 'August 2019 Sustained Monsoon Inundation',
    date: 'August 18, 2019',
    type: 'FLUVIAL',
    peakRain_mm: 64.0,
    riverLevel_m: 205.36,
    affectedZones: 52,
    severity: 'MODERATE',
    description: 'Hathnikund barrage discharge exceeding 8 lakh cusecs causing standard floodplain inundation along Yamuna bank agricultural pockets.'
  }
];

export const HistoricalPage: React.FC = () => {
  const [filterType, setFilterType] = useState<string>('ALL');

  const filtered = HISTORICAL_EVENTS.filter((e) =>
    filterType === 'ALL' ? true : e.type === filterType
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-black text-white tracking-tight">Historical Flood Events Database</h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Archival records of severe urban flood events and storm surges across Delhi NCR (labeled simulation evidence).
          </p>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400 ml-2" />
          {['ALL', 'PLUVIAL', 'FLUVIAL', 'COMPOUND'].map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1 rounded-lg transition-colors ${
                filterType === t
                  ? 'bg-cyan-500 text-slate-950 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((evt) => (
          <div key={evt.id} className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-cyan-400 font-bold">{evt.id}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                    {evt.type}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">{evt.name}</h3>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                evt.severity === 'EXTREME'
                  ? 'bg-red-500/20 text-red-400 border-red-500/30'
                  : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              }`}>
                {evt.severity}
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {evt.description}
            </p>

            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
              <div>
                <span className="text-[10px] text-slate-500 font-mono">Date</span>
                <div className="font-semibold text-white">{evt.date}</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-mono">Peak Rain</span>
                <div className="font-semibold text-cyan-300 font-mono">{evt.peakRain_mm} mm</div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 font-mono">River Level</span>
                <div className="font-semibold text-amber-300 font-mono">{evt.riverLevel_m} m</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
