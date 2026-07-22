function readCommunityConfirmations() {
  try { return JSON.parse(localStorage.getItem('volta-community-confirmations') || '{}'); } catch (_) { return {}; }
}
function writeCommunityConfirmations(value) {
  try { localStorage.setItem('volta-community-confirmations', JSON.stringify(value)); } catch (_) {}
}

const state = {
  vehicles: [], stations: [], manifest: null,
  vehicleId: 'byd-dolphin', currentSoc: 24, targetSoc: 80,
  powerMin: 0, currentType: 'all', compatibleOnly: true, confirmedOnly: false,
  selectedStation: null, selectedConnector: null, view: 'map', deferredPrompt: null,
  session: { step: 0, timer: null, elapsed: 0, progress: 0 },
  communityConfirmations: readCommunityConfirmations()
};

const $ = (id) => document.getElementById(id);
const fmtMoney = (v) => v == null ? 'Tarifa não informada' : new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'}).format(v);
const fmtMinutes = (mins) => mins < 60 ? `${Math.round(mins)} min` : `${Math.floor(mins/60)}h ${Math.round(mins%60).toString().padStart(2,'0')}`;
const fmtDecimal = (v, digits=1) => Number(v).toLocaleString('pt-BR', {minimumFractionDigits:digits, maximumFractionDigits:digits});
const fmtDate = (iso) => iso ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${iso}T12:00:00`)) : 'não informada';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

async function loadData() {
  const [vehicles, stations, manifest] = await Promise.all([
    fetch('data/vehicles.json').then(r => r.json()),
    fetch('data/stations.json').then(r => r.json()),
    fetch('data/source-manifest.json').then(r => r.ok ? r.json() : null).catch(() => null)
  ]);
  state.vehicles = vehicles;
  state.stations = stations;
  state.manifest = manifest;
}

function currentVehicle() { return state.vehicles.find(v => v.id === state.vehicleId); }
function effectivePower(connector, vehicle) { return Math.min(connector.powerKw, connector.current === 'DC' ? vehicle.maxDcKw : vehicle.maxAcKw); }
function bestConnector(station) {
  const vehicle = currentVehicle();
  const compatible = station.connectors.filter(c => (c.current === 'AC' && c.type === vehicle.acConnector) || (c.current === 'DC' && c.type === vehicle.dcConnector));
  return compatible.sort((a,b) => effectivePower(b, vehicle) - effectivePower(a, vehicle))[0] || null;
}
function estimate(station, connector = bestConnector(station)) {
  const vehicle = currentVehicle();
  if (!connector) return null;
  const delta = Math.max(0, state.targetSoc - state.currentSoc) / 100;
  const energyBattery = vehicle.usableKwh * delta;
  const gridEnergy = energyBattery / (connector.current === 'DC' ? .92 : .88);
  const power = effectivePower(connector, vehicle);
  const taper = connector.current === 'DC' ? (state.targetSoc > 80 ? 1.28 : state.currentSoc > 65 ? 1.18 : 1.08) : 1.03;
  const minutes = (gridEnergy / Math.max(power, .1)) * 60 * taper;
  const cost = station.tariffKwh == null ? null : gridEnergy * station.tariffKwh + (station.sessionFee || 0);
  const rangeKm = energyBattery / vehicle.consumptionKwh100 * 100;
  return { energyBattery, gridEnergy, power, minutes, cost, rangeKm, connector };
}
function filteredStations() {
  return state.stations.filter(station => {
    const connector = bestConnector(station);
    const connectorsByType = station.connectors.filter(c => state.currentType === 'all' || c.current === state.currentType);
    if (!connectorsByType.some(c => Number(c.powerKw || 0) >= state.powerMin)) return false;
    if (state.compatibleOnly && !connector) return false;
    if (state.confirmedOnly && !station.confirmed) return false;
    return true;
  });
}
function markerPosition(station) {
  const bounds = { minLat: -23.64, maxLat: -23.50, minLng: -46.76, maxLng: -46.52 };
  const x = ((station.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 86 + 7;
  const y = ((bounds.maxLat - station.lat) / (bounds.maxLat - bounds.minLat)) * 82 + 8;
  return {x: Math.max(6, Math.min(94,x)), y: Math.max(7, Math.min(93,y))};
}
function markerClass(station) {
  if (station.status !== 'operational') return 'unavailable';
  const connector = bestConnector(station);
  if (!connector || station.confidence < .65) return 'stale';
  const vehicle = currentVehicle();
  const max = connector.current === 'DC' ? vehicle.maxDcKw : vehicle.maxAcKw;
  return connector.powerKw > max * 1.5 ? 'limited' : 'compatible';
}
function freshnessLabel(station) {
  if (station.status !== 'operational') return 'Não operacional';
  if (station.freshness === 'recente') return 'Operacional · dado recente';
  if (station.freshness === 'desatualizada') return 'Operacional · dado desatualizado';
  return 'Operacional · dado muito antigo';
}
function statusColor(station) { if (station.status !== 'operational') return 'var(--danger)'; return station.confirmed ? 'var(--accent)' : 'var(--warning)'; }
function renderDatasetMeta() {
  const count = state.manifest?.canonicalCount ?? state.stations.length;
  const recent = state.manifest?.statusCounts?.operationalRecent ?? state.stations.filter(s => s.confirmed).length;
  $('datasetBadge').textContent = 'DADOS PÚBLICOS · STATUS NÃO LIVE';
  $('pilotDatasetMeta').textContent = `${count} pontos reais · ${recent} com verificação recente`;
}
function renderVehicle() {
  const select = $('vehicleSelect');
  select.innerHTML = state.vehicles.map(v => `<option value="${escapeHtml(v.id)}" ${v.id===state.vehicleId?'selected':''}>${escapeHtml(v.brand)} ${escapeHtml(v.model)}</option>`).join('');
  const v = currentVehicle();
  $('vehicleMeta').innerHTML = `${v.usableKwh} kWh úteis · AC ${v.maxAcKw} kW · DC ${v.maxDcKw} kW<br>${escapeHtml(v.acConnector)} / ${escapeHtml(v.dcConnector)} · ${v.consumptionKwh100} kWh/100 km`;
}
function render() {
  const stations = filteredStations();
  renderMarkers(stations); renderList(stations); renderSummary(stations);
  if (state.selectedStation) openStation(state.selectedStation.id, false);
}
function renderMarkers(stations) {
  $('markersLayer').innerHTML = stations.map(station => {
    const p = markerPosition(station); const est = estimate(station); const klass = markerClass(station);
    return `<button class="marker ${klass}" data-id="${escapeHtml(station.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${escapeHtml(station.name)}"><span class="marker-tooltip">${escapeHtml(station.name)} · ${est ? fmtMinutes(est.minutes) : 'incompatível'}</span></button>`;
  }).join('');
  document.querySelectorAll('.marker').forEach(el => el.addEventListener('click', () => openStation(el.dataset.id)));
}
function renderList(stations) {
  $('listView').innerHTML = stations.length ? stations.map(station => {
    const est = estimate(station); const best = bestConnector(station);
    return `<article class="station-card"><div class="card-top"><div><div class="source-row"><span class="source-pill">${escapeHtml(station.sourceName)}</span><span class="freshness ${escapeHtml(station.freshness)}">${escapeHtml(freshnessLabel(station))}</span></div><h3>${escapeHtml(station.name)}</h3><p>${escapeHtml(station.operator)}<br>${escapeHtml(station.address)}</p></div><span class="power-pill">${best ? best.powerKw : '?'} kW</span></div><div class="card-metrics"><div><strong>${est ? fmtMinutes(est.minutes) : '—'}</strong><span>tempo</span></div><div><strong>${est ? fmtMoney(est.cost) : '—'}</strong><span>estimativa</span></div><div><strong>${est ? Math.round(est.rangeKm)+' km' : '—'}</strong><span>autonomia</span></div></div><button class="card-button" data-id="${escapeHtml(station.id)}">Ver detalhes</button></article>`;
  }).join('') : `<div class="station-card"><h3>Nenhum resultado</h3><p>Reduza os filtros para ampliar a busca.</p></div>`;
  document.querySelectorAll('.card-button').forEach(el => el.addEventListener('click', () => openStation(el.dataset.id)));
}
function renderSummary(stations) {
  const estimates = stations.map(s => estimate(s)).filter(Boolean); const priced = estimates.filter(e => e.cost != null);
  $('resultCount').textContent = stations.length;
  $('fastestTime').textContent = estimates.length ? fmtMinutes(Math.min(...estimates.map(e => e.minutes))) : '—';
  $('lowestCost').textContent = priced.length ? fmtMoney(Math.min(...priced.map(e => e.cost))) : 'Sem tarifa';
}
function openStation(id, reveal=true) {
  const station = state.stations.find(s => s.id === id); if (!station) return;
  state.selectedStation = station; state.selectedConnector = bestConnector(station);
  const est = estimate(station, state.selectedConnector); const communityConfirmed = Boolean(state.communityConfirmations[station.id]);
  const costContent = est?.cost == null ? 'Tarifa não informada' : fmtMoney(est.cost);
  const sourceLink = station.sourceUrl ? `<a class="source-link" href="${escapeHtml(station.sourceUrl)}" target="_blank" rel="noopener">Ver registro na fonte</a>` : '';
  $('drawerContent').innerHTML = `<div class="drawer-hero"><div class="status-line" style="color:${statusColor(station)}">${escapeHtml(freshnessLabel(station))}</div><p class="eyebrow" style="margin-top:28px">${escapeHtml(station.operator).toUpperCase()}</p><h2>${escapeHtml(station.name)}</h2><p>${escapeHtml(station.address)}<br>Pagamento informado: ${escapeHtml(station.payment)}</p><div class="source-detail"><strong>${escapeHtml(station.sourceName)}</strong> · verificado em ${fmtDate(station.lastVerified)} · confiança ${Math.round(station.confidence*100)}%<br>${sourceLink}</div></div>${est ? `<div class="estimate-box"><h3>Estimativa para seu ${escapeHtml(currentVehicle().model)}</h3><div class="estimate-grid"><div><strong>${fmtMinutes(est.minutes)}</strong><span>${state.currentSoc}% → ${state.targetSoc}%</span></div><div><strong>${costContent}</strong><span>${fmtDecimal(est.gridEnergy)} kWh da rede</span></div><div><strong>${fmtDecimal(est.power,0)} kW</strong><span>potência efetiva</span></div><div><strong>+${Math.round(est.rangeKm)} km</strong><span>autonomia estimada</span></div></div></div>` : `<div class="data-note">Nenhum conector compatível foi identificado para este veículo.</div>`}<div class="connector-list"><p class="section-label">CONECTORES</p>${station.connectors.map(c => `<div class="connector-row"><div><strong>${escapeHtml(c.type)}</strong><br><span>${escapeHtml(c.current)} · ${c.quantity || 1} conector(es)</span></div><strong>${c.powerKw} kW</strong></div>`).join('')}</div><div class="drawer-actions"><button id="startDemo" class="primary-button" ${!est?'disabled':''}>Simular recarga e pagamento</button><button id="navigateBtn" class="secondary-button">Abrir rota</button><button id="confirmBtn" class="secondary-button">${communityConfirmed ? 'Funcionamento confirmado por você' : 'Confirmar funcionamento agora'}</button></div>${station.notes ? `<div class="data-note">${escapeHtml(station.notes)}</div>` : ''}<div class="data-note">Local e especificações vêm de uma fonte pública. O status não é ao vivo. O pagamento e o comando de recarga continuam simulados.</div>`;
  $('startDemo')?.addEventListener('click', () => openSession(station));
  $('navigateBtn')?.addEventListener('click', () => window.open(`https://www.google.com/maps/search/?api=1&query=${station.lat},${station.lng}`, '_blank', 'noopener'));
  $('confirmBtn')?.addEventListener('click', () => { state.communityConfirmations[station.id] = new Date().toISOString(); writeCommunityConfirmations(state.communityConfirmations); showToast('Confirmação local registrada. Ela não altera o status da operadora.'); openStation(station.id, false); });
  if (reveal) { $('stationDrawer').classList.add('open'); $('stationDrawer').setAttribute('aria-hidden','false'); }
}
function closeDrawer() { $('stationDrawer').classList.remove('open'); $('stationDrawer').setAttribute('aria-hidden','true'); }
function showToast(message) { const el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2600); }
function openSession(station) {
  const est = estimate(station); const billingTariff = station.tariffKwh ?? 2.00; const hypotheticalTariff = station.tariffKwh == null; const billingCost = est.gridEnergy * billingTariff + (station.sessionFee || 0);
  state.session = {step:0, timer:null, elapsed:0, progress:0, station, est, billingTariff, billingCost, hypotheticalTariff};
  $('sessionModal').classList.remove('hidden'); $('sessionTitle').textContent = 'Pagamento protegido';
  $('sessionSubtitle').textContent = hypotheticalTariff ? `${station.name} · simulação usa tarifa hipotética de ${fmtMoney(billingTariff)}/kWh` : `${station.name} · valor máximo simulado de ${fmtMoney(billingCost * 1.25)}`;
  $('sessionProgress').style.width = '0%'; $('sessionEnergy').textContent = '0,0 kWh'; $('sessionCost').textContent = fmtMoney(0); $('sessionElapsed').textContent = '00:00'; $('sessionAction').textContent = 'Pré-autorizar cartão de teste';
}
function closeSession() { clearInterval(state.session.timer); $('sessionModal').classList.add('hidden'); }
function sessionAction() {
  const s = state.session;
  if (s.step === 0) { s.step = 1; $('sessionTitle').textContent = 'Cartão autorizado'; $('sessionSubtitle').textContent = 'Token de teste criado. Nenhum dado de cartão foi armazenado.'; $('sessionAction').textContent = 'Iniciar recarga simulada'; $('sessionProgress').style.width = '12%'; }
  else if (s.step === 1) { s.step = 2; $('sessionTitle').textContent = 'Recarga em andamento'; $('sessionSubtitle').textContent = `${s.est.connector.type} · ${fmtDecimal(s.est.power,0)} kW efetivos${s.hypotheticalTariff ? ' · tarifa hipotética' : ''}`; $('sessionAction').textContent = 'Encerrar e capturar valor'; s.timer = setInterval(() => { s.elapsed += 8; s.progress = Math.min(92, s.progress + 2.6); const energy = s.est.gridEnergy * (s.progress/100); const cost = energy * s.billingTariff + (s.station.sessionFee || 0); $('sessionProgress').style.width = `${s.progress}%`; $('sessionEnergy').textContent = `${fmtDecimal(energy)} kWh`; $('sessionCost').textContent = fmtMoney(cost); $('sessionElapsed').textContent = `${Math.floor(s.elapsed/60).toString().padStart(2,'0')}:${(s.elapsed%60).toString().padStart(2,'0')}`; }, 500); }
  else if (s.step === 2) { clearInterval(s.timer); s.step = 3; s.progress = 100; $('sessionProgress').style.width = '100%'; $('sessionEnergy').textContent = `${fmtDecimal(s.est.gridEnergy)} kWh`; $('sessionCost').textContent = fmtMoney(s.billingCost); $('sessionTitle').textContent = 'Sessão conciliada'; $('sessionSubtitle').textContent = `Fluxo demonstrativo concluído${s.hypotheticalTariff ? ' com tarifa hipotética' : ''}: pré-autorização, consumo, captura e recibo.`; $('sessionAction').textContent = 'Fechar demonstração'; }
  else closeSession();
}
function bindEvents() {
  $('vehicleSelect').addEventListener('change', e => { state.vehicleId=e.target.value; renderVehicle(); render(); });
  $('currentSoc').addEventListener('input', e => { state.currentSoc=Number(e.target.value); if(state.targetSoc<=state.currentSoc){state.targetSoc=Math.min(100,state.currentSoc+10);$('targetSoc').value=state.targetSoc;} $('currentSocValue').textContent=`${state.currentSoc}%`; $('targetSocValue').textContent=`${state.targetSoc}%`; render(); });
  $('targetSoc').addEventListener('input', e => { state.targetSoc=Math.max(Number(e.target.value),state.currentSoc+1); e.target.value=state.targetSoc; $('targetSocValue').textContent=`${state.targetSoc}%`; render(); });
  $('powerFilter').addEventListener('change', e => { state.powerMin=Number(e.target.value); render(); });
  $('compatibleOnly').addEventListener('change', e => { state.compatibleOnly=e.target.checked; render(); });
  $('confirmedOnly').addEventListener('change', e => { state.confirmedOnly=e.target.checked; render(); });
  document.querySelectorAll('#currentTypeFilter .segment').forEach(btn => btn.addEventListener('click', () => { document.querySelectorAll('#currentTypeFilter .segment').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); state.currentType=btn.dataset.value; render(); }));
  $('clearFilters').addEventListener('click', () => { state.powerMin=0; state.currentType='all'; state.compatibleOnly=true; state.confirmedOnly=false; $('powerFilter').value='0'; $('compatibleOnly').checked=true; $('confirmedOnly').checked=false; document.querySelectorAll('#currentTypeFilter .segment').forEach(b=>b.classList.toggle('active',b.dataset.value==='all')); render(); });
  $('mapViewBtn').addEventListener('click',()=>switchView('map')); $('listViewBtn').addEventListener('click',()=>switchView('list')); $('closeDrawer').addEventListener('click',closeDrawer); $('closeSession').addEventListener('click',closeSession); $('sessionAction').addEventListener('click',sessionAction); $('sessionModal').addEventListener('click', e => { if(e.target===$('sessionModal')) closeSession(); });
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); state.deferredPrompt=e; $('installBtn').classList.remove('hidden'); });
  $('installBtn').addEventListener('click', async () => { if(!state.deferredPrompt)return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt=null; $('installBtn').classList.add('hidden'); });
}
function switchView(view) { state.view=view; $('mapView').classList.toggle('hidden',view!=='map'); $('listView').classList.toggle('hidden',view!=='list'); $('mapViewBtn').classList.toggle('active',view==='map'); $('listViewBtn').classList.toggle('active',view==='list'); }
async function init() {
  try { await loadData(); renderDatasetMeta(); renderVehicle(); bindEvents(); render(); if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('service-worker.js'); }
  catch(err) { console.error(err); document.body.innerHTML='<main style="padding:40px;color:white">Falha ao carregar o piloto.</main>'; }
}
init();
