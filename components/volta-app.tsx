"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Connector = { type: string; current: string; powerKw: number; quantity: number; status: string };
type Station = { id: string; name: string; operator: string; address: string; city: string; lat: number; lng: number; connectors: Connector[]; tariffKwh: number | null; payment: string; status: string; statusLabel: string; freshness: string; confidence: number; lastVerified: string; sourceName: string; sourceUrl: string; relatedUrl?: string | null };
type Vehicle = { id: string; brand: string; model: string; usableKwh: number; maxAcKw: number; maxDcKw: number; acConnector: string; dcConnector: string; consumptionKwh100: number };
type Location = { lat: number; lng: number };
type MapLibreModule = typeof import("maplibre-gl");

type Props = { stations: Station[]; vehicles: Vehicle[] };

const rad = (n: number) => (n * Math.PI) / 180;
function distanceKm(a: Location, b: Location) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function maxPower(s: Station) { return Math.max(...s.connectors.map(c => c.powerKw)); }
function estimate(s: Station, v: Vehicle, start: number, target: number) {
  const compatible = s.connectors.filter(c => c.type === v.acConnector || c.type === v.dcConnector);
  if (!compatible.length) return null;
  const power = Math.max(...compatible.map(c => Math.min(c.powerKw, c.current === "DC" ? v.maxDcKw : v.maxAcKw)));
  const energy = v.usableKwh * Math.max(0, target - start) / 100;
  const minutes = power > 0 ? Math.round((energy / power) * 60 * (power > 50 ? 1.18 : 1.08)) : 0;
  return { power, energy, minutes, cost: s.tariffKwh == null ? null : energy * s.tariffKwh, range: energy / v.consumptionKwh100 * 100 };
}
function money(n: number | null) { return n == null ? "A confirmar" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function duration(n: number) { return n < 60 ? `${n} min` : `${Math.floor(n / 60)}h ${n % 60}min`; }

export function VoltaApp({ stations, vehicles }: Props) {
  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const mapModuleRef = useRef<MapLibreModule | null>(null);
  const markers = useRef<import("maplibre-gl").Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [start, setStart] = useState(20);
  const [target, setTarget] = useState(80);
  const [power, setPower] = useState(0);
  const [current, setCurrent] = useState("all");
  const [operational, setOperational] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"map" | "list">("map");
  const [selected, setSelected] = useState<Station | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [notice, setNotice] = useState("");
  const vehicle = (vehicles.find(v => v.id === vehicleId) ?? vehicles[0])!;

  const rows = useMemo(() => stations.map(station => ({
    station,
    estimate: estimate(station, vehicle, start, target),
    distance: location ? distanceKm(location, station) : null
  })).filter(row => {
    const hay = `${row.station.name} ${row.station.operator} ${row.station.address}`.toLowerCase();
    if (query && !hay.includes(query.toLowerCase())) return false;
    if (operational && row.station.status !== "operational") return false;
    if (power && maxPower(row.station) < power) return false;
    if (current !== "all" && !row.station.connectors.some(c => c.current === current)) return false;
    return true;
  }).sort((a, b) => location ? (a.distance ?? 999) - (b.distance ?? 999) : b.station.confidence - a.station.confidence), [stations, vehicle, start, target, location, query, operational, power, current]);

  useEffect(() => {
    let cancelled = false;
    async function bootMap() {
      if (!mapNode.current || mapRef.current) return;
      const module = await import("maplibre-gl");
      if (cancelled || !mapNode.current) return;
      mapModuleRef.current = module;
      const map = new module.Map({ container: mapNode.current, style: "https://demotiles.maplibre.org/style.json", center: [-46.6333, -23.5505], zoom: 10.2 });
      map.addControl(new module.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
      map.once("load", () => setMapReady(true));
    }
    bootMap().catch(() => setNotice("O mapa não pôde ser carregado."));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      mapModuleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const module = mapModuleRef.current;
    if (!map || !module || !mapReady) return;
    markers.current.forEach(m => m.remove());
    markers.current = rows.map(({ station }) => {
      const el = document.createElement("button");
      el.className = `pin ${station.status !== "operational" ? "offline" : ""}`;
      el.type = "button";
      el.title = station.name;
      el.innerHTML = `<span>${Math.round(maxPower(station))}</span>`;
      el.onclick = () => setSelected(station);
      return new module.Marker({ element: el }).setLngLat([station.lng, station.lat]).addTo(map);
    });
  }, [rows, mapReady]);

  function locate() {
    if (!navigator.geolocation) return setNotice("Geolocalização indisponível neste dispositivo.");
    navigator.geolocation.getCurrentPosition(pos => {
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setLocation(next); mapRef.current?.flyTo({ center: [next.lng, next.lat], zoom: 12 }); setNotice("Localização atualizada.");
    }, () => setNotice("Não foi possível acessar sua localização."), { enableHighAccuracy: true, timeout: 12000 });
  }

  function saveActivity(kind: "validation" | "session", station: Station) {
    const key = "volta.activity";
    const items = JSON.parse(localStorage.getItem(key) || "[]");
    items.unshift({ id: crypto.randomUUID(), kind, stationId: station.id, stationName: station.name, createdAt: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(items.slice(0, 100)));
    setNotice(kind === "validation" ? "Validação registrada neste dispositivo." : "Recarga registrada neste dispositivo.");
  }

  const operationalCount = rows.filter(r => r.station.status === "operational").length;
  const fastCount = rows.filter(r => maxPower(r.station) >= 50).length;

  return <div className="app">
    <header><a className="brand" href="#"><span>↯</span><div><strong>VOLTA</strong><small>rede de recarga</small></div></a><nav><a href="#explore">Explorar</a><a href="#pilot">Piloto</a><a href="/api/health">API</a></nav><div className="mode"><i />VOLTA Core</div></header>
    <main id="explore">
      <aside>
        <p className="kicker">Piloto São Paulo</p><h1>Encontre a recarga certa para o seu carro.</h1><p className="muted">Compatibilidade, potência, custo estimado e evidência sobre a qualidade dos dados.</p>
        <section><label>Veículo<select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>{vehicles.map(v => <option key={v.id} value={v.id}>{v.brand} {v.model}</option>)}</select></label><div className="specs"><span>{vehicle.usableKwh} kWh</span><span>AC {vehicle.maxAcKw} kW</span><span>DC {vehicle.maxDcKw} kW</span></div><label>Carga atual <b>{start}%</b><input type="range" min="5" max="90" value={start} onChange={e => setStart(Number(e.target.value))} /></label><label>Objetivo <b>{target}%</b><input type="range" min="20" max="100" value={target} onChange={e => setTarget(Math.max(Number(e.target.value), start + 5))} /></label></section>
        <section><label>Buscar<input placeholder="Estação, operador ou endereço" value={query} onChange={e => setQuery(e.target.value)} /></label><label>Potência mínima<select value={power} onChange={e => setPower(Number(e.target.value))}><option value="0">Qualquer</option><option value="7">7 kW+</option><option value="22">22 kW+</option><option value="50">50 kW+</option><option value="100">100 kW+</option></select></label><label>Corrente<select value={current} onChange={e => setCurrent(e.target.value)}><option value="all">AC e DC</option><option value="AC">AC</option><option value="DC">DC</option></select></label><label className="check"><input type="checkbox" checked={operational} onChange={e => setOperational(e.target.checked)} />Somente operacionais</label><button className="locate" onClick={locate}>◎ Usar minha localização</button></section>
        <div className="warning">Dados públicos não representam disponibilidade ao vivo. Cada ponto mostra fonte, recência e confiança.</div>
      </aside>
      <div className="results">
        <div className="toolbar"><div><p className="kicker">Rede unificada</p><h2>{rows.length} estações encontradas</h2></div><div className="tabs"><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Mapa</button><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Lista</button></div></div>
        <div className="metrics"><div><strong>{operationalCount}</strong><span>operacionais</span></div><div><strong>{fastCount}</strong><span>rápidas 50 kW+</span></div><div><strong>{location ? "Por distância" : "Por confiança"}</strong><span>ordenação atual</span></div><div><strong>{vehicle.brand}</strong><span>{vehicle.model}</span></div></div>
        {view === "map" ? <div className="map"><div ref={mapNode} /></div> : <div className="grid">{rows.map(row => <StationCard key={row.station.id} row={row} onOpen={() => setSelected(row.station)} />)}</div>}
      </div>
    </main>
    {selected && <Drawer station={selected} vehicle={vehicle} start={start} target={target} distance={location ? distanceKm(location, selected) : null} onClose={() => setSelected(null)} onSave={saveActivity} />}
    {notice && <button className="toast" onClick={() => setNotice("")}>{notice}</button>}
  </div>;
}

function StationCard({ row, onOpen }: { row: { station: Station; estimate: ReturnType<typeof estimate>; distance: number | null }; onOpen: () => void }) {
  const { station, estimate: e, distance } = row;
  return <article className="card"><div className="cardtop"><span className={`status ${station.status === "operational" ? "ok" : "bad"}`}>{station.status === "operational" ? "Operacional" : "Indisponível"}</span><strong>{maxPower(station)} kW</strong></div><h3>{station.name}</h3><p>{station.address}</p><small>{station.operator} · {distance == null ? station.freshness : `${distance.toFixed(1)} km`}</small>{e ? <div className="estimate"><span><b>{e.energy.toFixed(1)}</b> kWh</span><span><b>{duration(e.minutes)}</b> tempo</span><span><b>{money(e.cost)}</b> custo</span></div> : <div className="incompatible">Sem conector compatível com este veículo</div>}<button onClick={onOpen}>Ver estação</button></article>;
}

function Drawer({ station, vehicle, start, target, distance, onClose, onSave }: { station: Station; vehicle: Vehicle; start: number; target: number; distance: number | null; onClose: () => void; onSave: (kind: "validation" | "session", s: Station) => void }) {
  const e = estimate(station, vehicle, start, target);
  const google = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;
  const waze = `https://www.waze.com/ul?ll=${station.lat}%2C${station.lng}&navigate=yes`;
  return <div className="backdrop" onMouseDown={ev => ev.target === ev.currentTarget && onClose()}><aside className="drawer"><button className="close" onClick={onClose}>×</button><p className="kicker">{station.operator}</p><h2>{station.name}</h2><p className="muted">{station.address}{distance == null ? "" : ` · ${distance.toFixed(1)} km`}</p><div className="source"><span>{station.sourceName}</span><span>Verificado em {new Date(`${station.lastVerified}T12:00:00`).toLocaleDateString("pt-BR")}</span><b>{Math.round(station.confidence * 100)}% confiança</b></div>{e && <div className="detailmetrics"><div><span>Potência efetiva</span><b>{e.power} kW</b></div><div><span>Energia</span><b>{e.energy.toFixed(1)} kWh</b></div><div><span>Tempo</span><b>{duration(e.minutes)}</b></div><div><span>Custo</span><b>{money(e.cost)}</b></div><div><span>Autonomia</span><b>+{Math.round(e.range)} km</b></div><div><span>Pagamento</span><b>{station.payment}</b></div></div>}<h3>Conectores</h3><div className="connectors">{station.connectors.map((c, i) => <div key={i}><span>{c.type} · {c.current} · {c.quantity}x</span><b>{c.powerKw} kW</b></div>)}</div><div className="actions"><a href={google} target="_blank">Google Maps</a><a href={waze} target="_blank">Waze</a><button onClick={() => onSave("validation", station)}>Validar estação</button><button onClick={() => onSave("session", station)}>Registrar recarga</button></div><a className="origin" href={station.sourceUrl} target="_blank">Abrir fonte original ↗</a></aside></div>;
}
