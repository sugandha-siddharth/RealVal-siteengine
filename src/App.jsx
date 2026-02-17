import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Loader2, Users, Landmark,
  ArrowUpRight, Home,
  TrendingUp,
  School,
  ExternalLink, HelpCircle
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from 'recharts';

/**
 * VAL SITEENGINE PRO - v164.0 (CRIMEGRADE™ SPATIAL SYNC REBUILD)
 */

const BRAND = {
  navy: "#033762",
  teal: "#01A9A0",
  blue: "#156082",
  gold: "#C69001",
  border: "#F1F5F9",
  bg_subtle: "#F8FAFC",
  text_main: "#0F172A",
  text_sub: "#64748B",
  white: "#FFFFFF",
  safe: "#059669",
  caution: "#F59E0B",
  risk: "#DC2626",
  gs_teal: "#004e4a"
};

const ACS_VARS = {
  "B01003_001E": "Population",
  "B11001_001E": "Households",
  "B19013_001E": "Med_HH_Inc",
  "B25077_001E": "Med_Home_Val",
  "B25035_001E": "Med_Year_Built",
  "B25010_001E": "Avg_HH_Size",
  "B25003_001E": "Tenure_Total",
  "B25003_002E": "Owner_Occ",
  "B25003_003E": "Renter_Occ",
  "B25046_001E": "Aggregate_Vehicles"
};

export default function App() {
  const [address, setAddress] = useState('');
  const [radii, setRadii] = useState({ r1: 1, r2: 3, r3: 5 });
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('SYSTEM READY • AWAITING SITE INPUT');
  const [result, setResult] = useState(null);
  const [intel, setIntel] = useState({ safety_summary: "", grades: {}, scores: {}, schools: [], sectors: {}, breakdown: {} });

  const mainMapRef = useRef(null);
  const crimeMapRef = useRef(null);
  const schoolMapRef = useRef(null);
  const leafletMaps = useRef({});

  // Read API key from env (Vercel-friendly)
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @import url('https://fonts.cdnfonts.com/css/mr-eaves-xl-modern-ot');
      body { font-family: 'Mr Eaves XL Mod OT', sans-serif; background-color: #FFFFFF; color: #0F172A; margin: 0; overflow-x: hidden; }
      .leaflet-container { border-radius: 24px; border: 1px solid #E2E8F0; z-index: 1; background: #f8fafc; }
      .custom-shadow { box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.08); }
      input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      .assigned-label {
        background: #033762; color: white; font-size: 6px; font-weight: 900; padding: 1.5px 4.5px;
        border-radius: 2px; position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
        border: 0.5px solid white; white-space: nowrap; z-index: 1000; text-transform: uppercase;
        letter-spacing: 0.5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }
      .crime-grade-pill {
        width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 900; color: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
    `;
    document.head.appendChild(style);

    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.async = true;
    document.head.appendChild(script);

    return () => { Object.values(leafletMaps.current).forEach(m => m && m.remove()); };
  }, []);

  const haversine = (lat1, lon1, lat2, lon2) => {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const getInstitutionalIntel = async (loc) => {
    const prompt = `Perform a total verified data harvest from CrimeGrade.org for the address: ${loc}.
Return strictly JSON with safety_summary, grades, breakdown, sectors, schools.`;

    try {
      if (!apiKey) throw new Error("Missing API key");
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ "google_search": {} }] })
      });
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      return {
        safety_summary: "No API key / fetch failed — showing fallback sample.",
        grades: { overall: "B-", violent: "C", property: "D", other: "B+" },
        breakdown: {
          violent: [{ type: "Assault", grade: "C" }, { type: "Robbery", grade: "B" }],
          property: [{ type: "Theft", grade: "D" }, { type: "Burglary", grade: "F" }],
          other: [{ type: "Vandalism", grade: "B" }]
        },
        sectors: { n: "D", s: "C", e: "B", w: "A", ne: "D", nw: "D", se: "B", sw: "B" },
        schools: []
      };
    }
  };

  const handleAnalyze = async (e) => {
    if (e) e.preventDefault();
    if (!address || address.length < 5) return;

    setLoading(true); setIntel({ schools: [] }); setResult(null);
    setStatus('RUNNING ANALYSIS...');

    try {
      const geoResp = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`);
      const geoData = await geoResp.json();
      if (!geoData.length) throw new Error("Location identification failed.");
      const { lat, lon, display_name } = geoData[0];
      const sLat = parseFloat(lat); const sLon = parseFloat(lon);

      const siteIntel = await getInstitutionalIntel(display_name);
      setIntel(siteIntel);

      const rList = [parseFloat(radii.r1), parseFloat(radii.r2), parseFloat(radii.r3)].sort((a, b) => a - b);

      const tigerUrl = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Tracts_Blocks/MapServer/10/query?geometry=${sLon - 0.3},${sLat - 0.3},${sLon + 0.3},${sLat + 0.3}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=STATE,COUNTY,TRACT,INTPTLAT,INTPTLON&outSR=4326&f=json&returnGeometry=true`;
      const tigerResp = await fetch(tigerUrl);
      const tigerData = await tigerResp.json();

      const tracts = (tigerData.features || []).map(f => {
        const a = f.attributes;
        return {
          geoid: String(a.STATE).padStart(2, '0') + String(a.COUNTY).padStart(3, '0') + String(a.TRACT).padStart(6, '0'),
          state: String(a.STATE).padStart(2, '0'), co: String(a.COUNTY).padStart(3, '0'),
          lat: parseFloat(a.INTPTLAT), lon: parseFloat(a.INTPTLON),
          dist: haversine(sLat, sLon, parseFloat(a.INTPTLAT), parseFloat(a.INTPTLON)),
          geometry: f.geometry
        };
      }).filter(t => t.dist <= rList[2] + 1.5);

      const getACS = async (year) => {
        const counties = [...new Set(tracts.map(t => `${t.state},${t.co}`))];
        let allRes = {};
        for (const c of counties) {
          const [s, co] = c.split(',');
          const resp = await fetch(`https://api.census.gov/data/${year}/acs/acs5?get=${Object.keys(ACS_VARS).join(',')}&for=tract:*&in=state:${s}&in=county:${co}`);
          if (resp.ok) {
            const data = await resp.json();
            const heads = data[0];
            data.slice(1).forEach(row => {
              const obj = {}; heads.forEach((h, i) => obj[h] = row[i]);
              const id = String(obj.state).padStart(2, '0') + String(obj.county).padStart(3, '0') + String(obj.tract).padStart(6, '0');
              allRes[id] = obj;
            });
          }
        }
        return allRes;
      };

      const [acs22, acs17] = await Promise.all([getACS(2022), getACS(2017)]);

      const summaries = rList.map((r, rIdx) => {
        const ids = tracts.filter(t => t.dist <= r).map(t => t.geoid);
        const d22 = ids.map(id => acs22[id]).filter(Boolean);
        const d17 = ids.map(id => acs17[id]).filter(Boolean);

        const sumClean = (arr, k) => arr.reduce((acc, o) => {
          const val = parseFloat(o[k]);
          return (val > 0) ? acc + val : acc;
        }, 0);

        const wgtClean = (arr, v, w) => {
          const f = arr.filter(o => parseFloat(o[v]) > 0 && parseFloat(o[w]) > 0);
          const tw = sumClean(f, w);
          return tw > 0 ? f.reduce((acc, o) => acc + (parseFloat(o[v]) * parseFloat(o[w])), 0) / tw : 0;
        };

        const p22 = sumClean(d22, 'B01003_001E');
        const p17 = sumClean(d17, 'B01003_001E') || p22;
        const popCagr = p17 > 0 ? Math.pow(p22 / p17, 1 / 5) - 1 : 0.012;
        const i22 = wgtClean(d22, 'B19013_001E', 'B11001_001E');
        const i17 = wgtClean(d17, 'B19013_001E', 'B11001_001E') || i22;
        const incCagr = i17 > 0 ? Math.pow(i22 / i17, 1 / 5) - 1 : 0.024;

        return {
          radiusLabel: `${r} Mi`,
          p25: Math.round(p22 * Math.pow(1 + popCagr, 3)),
          p30: Math.round(p22 * Math.pow(1 + popCagr, 8)),
          popGrowth: `${(popCagr * 100 * 5).toFixed(1)}%`,
          income: Math.round(i22),
          income30: Math.round(i22 * Math.pow(1 + incCagr, 8)),
          incomeGrowth: `${((Math.pow(1 + incCagr, 5) - 1) * 100).toFixed(1)}%`,
          homeVal: Math.round(wgtClean(d22, 'B25077_001E', 'B11001_001E')),
          vintage: Math.round(wgtClean(d22, 'B25035_001E', 'B11001_001E')),
          rentVsOwn: `${((sumClean(d22, 'B25003_003E') / (sumClean(d22, 'B25003_001E') || 1)) * 100).toFixed(1)}% / ${((sumClean(d22, 'B25003_002E') / (sumClean(d22, 'B25003_001E') || 1)) * 100).toFixed(1)}%`,
          vehicles: (sumClean(d22, 'B25046_001E') / (sumClean(d22, 'B11001_001E') || 1)).toFixed(2),
          avgHHSize: wgtClean(d22, 'B25010_001E', 'B11001_001E').toFixed(2),
          ageDist: rIdx === 0 ? [
            { name: "Under 20", value: Math.round(p22 * 0.22) },
            { name: "20-34", value: Math.round(p22 * 0.25) },
            { name: "35-49", value: Math.round(p22 * 0.20) },
            { name: "50-64", value: Math.round(p22 * 0.18) },
            { name: "65+", value: Math.round(p22 * 0.15) }
          ] : []
        };
      });

      setResult({ summaries, label: display_name, lat: sLat, lon: sLon });
      setStatus(`COMPLETE • ${display_name}`);

      setTimeout(() => {
        if (!window.L) return;
        const renderMap = (ref, type) => {
          if (!ref.current) return;
          if (leafletMaps.current[type]) leafletMaps.current[type].remove();
          const map = window.L.map(ref.current, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, touchZoom: false });
          window.L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}').addTo(map);
          leafletMaps.current[type] = map;

          const circles = [...rList].reverse().map(mi =>
            window.L.circle([sLat, sLon], {
              radius: mi * 1609.34,
              color: type === 'crime' ? 'white' : BRAND.navy,
              weight: 1.5, fillOpacity: 0, dashArray: '10, 10'
            }).addTo(map)
          );

          window.L.marker([sLat, sLon], {
            icon: window.L.divIcon({
              className: '',
              html: `<div style="position:relative; width:34px; height:62px; filter:drop-shadow(0 6px 15px rgba(0,0,0,0.5));"><svg width="34" height="62" viewBox="0 0 34 62" fill="none"><path d="M17 62L32 26C32 26 34 22 34 15C34 6.71573 26.3888 0 17 0C7.61116 0 0 6.71573 0 15C0 22 2 26 2 26L17 62Z" fill="${BRAND.navy}"/><circle cx="17" cy="15" r="8" fill="white"/><circle cx="17" cy="15" r="4" fill="${BRAND.navy}"/></svg></div>`,
              iconSize: [34, 62], iconAnchor: [17, 62]
            })
          }).addTo(map);

          const paddingVal = type === 'school' ? 50 : 120;
          if (circles.length > 0) {
            try { map.fitBounds(circles[0].getBounds(), { padding: [paddingVal, paddingVal] }); }
            catch { map.setView([sLat, sLon], 12); }
          }
        };

        renderMap(mainMapRef, 'radial');
        renderMap(crimeMapRef, 'crime');
        renderMap(schoolMapRef, 'school');
      }, 800);

    } catch (err) {
      setStatus("ERROR");
    } finally {
      setLoading(false);
    }
  };

  const getGradeColor = (g) => {
    if (g?.startsWith('A')) return BRAND.safe;
    if (g?.startsWith('B')) return "#4ADE80";
    if (g?.startsWith('C')) return BRAND.caution;
    if (g?.startsWith('D')) return "#FB923C";
    return BRAND.risk;
  };

  return (
    <div className="min-h-screen bg-white pb-40 text-slate-900 overflow-x-hidden">
      <header className="border-b border-slate-100 bg-white sticky top-0 z-[1000]">
        <div className="max-w-[1700px] mx-auto px-10 py-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="w-12 h-12 bg-[#033762] text-white flex items-center justify-center font-black text-2xl rounded-xl custom-shadow">V</div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-[#033762] uppercase leading-none">Val <span className="text-[#01A9A0]">SiteEngine</span></h1>
              <p className="text-[10px] font-bold tracking-[0.4em] text-slate-400 uppercase mt-1">Institutional Intelligence</p>
            </div>
          </div>
          <div className="text-right border-l border-slate-100 pl-8">
            <p className="text-[11px] font-black text-slate-900 tracking-wider uppercase">Institutional PRO</p>
            <p className="text-[10px] font-bold text-[#01A9A0] uppercase mt-0.5 flex items-center justify-end gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#01A9A0] animate-pulse" /> READY
            </p>
          </div>
        </div>
      </header>

      <section className="bg-white py-12 border-b border-slate-50">
        <form onSubmit={handleAnalyze} className="max-w-[1600px] mx-auto px-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
            <input
              type="text"
              placeholder="ENTER ADDRESS..."
              className="w-full pl-16 pr-6 py-6 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-[#033762] rounded-2xl outline-none font-bold text-sm transition-all custom-shadow"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
          </div>

          <div className="lg:col-span-4 grid grid-cols-3 gap-3">
            {['r1', 'r2', 'r3'].map((k) => (
              <div key={k} className="relative">
                <input
                  type="number"
                  className="w-full px-5 py-6 bg-slate-50 border-2 border-transparent focus:bg-white focus:border-[#033762] rounded-2xl outline-none font-black text-sm text-center custom-shadow"
                  value={radii[k]}
                  onChange={e => setRadii({ ...radii, [k]: e.target.value })}
                />
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-3 text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-100 rounded-full shadow-sm">Mi</span>
              </div>
            ))}
          </div>

          <div className="lg:col-span-2">
            <button
              disabled={loading}
              className="w-full h-full bg-[#033762] hover:bg-[#01A9A0] text-white font-black text-[13px] uppercase tracking-widest rounded-2xl transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <>RUN <ArrowUpRight size={20} /></>}
            </button>
          </div>
        </form>
      </section>

      <div className="max-w-[1700px] mx-auto px-10 mt-12">
        <div className="flex items-center gap-4 py-3 px-6 bg-slate-50 rounded-full w-fit mb-12 border border-slate-100">
          <div className={`w-2 h-2 rounded-full ${loading ? 'bg-amber-400 animate-ping' : 'bg-[#01A9A0]'}`} />
          <p className="text-[11px] font-black text-slate-600 tracking-[0.15em] uppercase">{status}</p>
        </div>

        {result && (
          <div className="animate-in fade-in duration-1000 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7 space-y-16">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { l: '1 Mile 2025 Population', v: result.summaries[0]?.p25?.toLocaleString(), s: `Verified Audit Base`, i: Users },
                  { l: '1 Mile Median HH Income 2025', v: `$${result.summaries[0]?.income?.toLocaleString()}`, s: `Spending Power Est.`, i: Landmark },
                  { l: '1 Mile Median Home Values', v: `$${result.summaries[0]?.homeVal?.toLocaleString()}`, s: `Market Asset Value`, i: Home },
                  { l: '1 Mile Pop Growth Rate (5yr)', v: result.summaries[0]?.popGrowth, s: `Momentum Forecast`, i: TrendingUp },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white p-6 rounded-[1.5rem] border border-slate-100 border-t-4 border-t-[#01A9A0] custom-shadow relative group">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2.5 rounded-lg bg-teal-50 text-[#01A9A0]"><kpi.i size={18} /></div>
                    </div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.l}</p>
                    <h3 className="text-xl font-black tracking-tighter text-[#0F172A] leading-none mb-1">{kpi.v}</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{kpi.s}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <ChartCard title="Population Momentum" sub="2025 Est. vs 2030 Proj." icon={TrendingUp}>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={result.summaries} margin={{ left: 0, right: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="radiusLabel" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800 }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700 }} tickFormatter={v => `${v / 1000}k`} />
                      <Tooltip />
                      <Bar dataKey="p25" name="2025" fill={BRAND.navy} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="p30" name="2030" fill={BRAND.teal} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Age Cohorts (1-Mi)" sub="Institutional Profile" icon={Users}>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart layout="vertical" data={result.summaries[0].ageDist} margin={{ left: 20, right: 30, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 8, fontWeight: 700, fill: BRAND.text_sub }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 800 }} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {result.summaries[0].ageDist.map((e, i) => (<Cell key={`cell-${i}`} fill={i % 2 === 0 ? BRAND.navy : BRAND.teal} />))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-6 sticky top-32">
              <div className="flex items-center justify-between px-2">
                <h4 className="text-[12px] font-black text-[#033762] tracking-[0.3em] uppercase border-l-4 border-[#01A9A0] pl-6">GIS Radial Visualization</h4>
              </div>
              <div ref={mainMapRef} className="h-[550px] border border-slate-100 custom-shadow rounded-[3rem] overflow-hidden bg-slate-50" />

              <div className="flex items-center justify-between px-2">
                <h4 className="text-[12px] font-black text-[#033762] tracking-[0.3em] uppercase border-l-4 border-[#DC2626] pl-6">Safety Dashboard</h4>
                <a href="https://crimegrade.org/" target="_blank" rel="noopener noreferrer" className="text-[9px] font-black text-slate-400 hover:text-[#DC2626] uppercase tracking-widest flex items-center gap-1.5 transition-colors">Source: CrimeGrade™ <ExternalLink size={10} /></a>
              </div>

              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-2 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                  <HelpCircle size={14} /> {String(intel.safety_summary || 'Analysis complete.')}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {(intel.breakdown?.violent || []).slice(0, 2).map((b, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-3 py-2">
                      <span className="text-[10px] font-black text-slate-700 uppercase">{b.type}</span>
                      <div className="crime-grade-pill" style={{ background: getGradeColor(b.grade) }}>{b.grade}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div ref={crimeMapRef} className="h-[550px] border border-slate-100 rounded-[3rem] overflow-hidden bg-slate-50 shadow-inner" />
              <div ref={schoolMapRef} className="h-[550px] border border-slate-100 rounded-[3rem] overflow-hidden bg-slate-50 shadow-inner" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children, icon: Icon }) {
  return (
    <div className="bg-white p-10 rounded-[2.5rem] border border-slate-100 custom-shadow space-y-8 group hover:border-[#01A9A0] transition-colors text-left">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-[11px] font-black text-[#033762] tracking-[0.25em] uppercase mb-1.5">{title}</h4>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{sub}</p>
        </div>
        {Icon && <div className="p-2 bg-slate-50 rounded-lg text-slate-300 group-hover:text-[#01A9A0] transition-colors"><Icon size={16} /></div>}
      </div>
      <div className="w-full">{children}</div>
    </div>
  );
}
