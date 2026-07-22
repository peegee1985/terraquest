import { useEffect, useState } from 'react';
import { ChevronLeft, Compass, Flag, Flame, Footprints, House, Layers, Map, MapPin, Pause, Play, Settings, ShieldCheck, Square, Trophy, WifiOff } from 'lucide-react';

type Tab = 'home' | 'map' | 'quests' | 'progress' | 'settings';

const quests = [
  ['Ještě jeden úsek', '4 832 / 6 000 kroků', 81, 100],
  ['Za hranicí známého', '42 / 50 oblastí', 84, 150],
  ['Plynulý pohyb', '25 / 25 minut', 100, 75],
] as const;

export default function TerraQuestPreview() {
  const [tab, setTab] = useState<Tab>('home');
  const [exploring, setExploring] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [offline, setOffline] = useState(false);
  const [levelUp, setLevelUp] = useState(false);

  useEffect(() => {
    if (!exploring || paused) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [exploring, paused]);

  return (
    <main className="min-h-screen bg-[#07111A] text-[#F5F7F4] sm:flex sm:items-center sm:justify-center sm:p-6">
      <section className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#07111A] sm:h-[860px] sm:rounded-[34px] sm:border sm:border-[#294153] sm:shadow-2xl">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {onboardingStep !== null ? (
            <OnboardingScreen
              denied={permissionDenied}
              step={onboardingStep}
              onAllow={() => { setPermissionDenied(false); setOnboardingStep(3); }}
              onDeny={() => setPermissionDenied(true)}
              onDone={() => { setOnboardingStep(null); setTab('home'); }}
              onNext={() => setOnboardingStep((value) => Math.min(3, (value ?? 0) + 1))}
            />
          ) : null}
          {onboardingStep === null && tab === 'home' && <HomeScreen onExplore={() => setTab('map')} onQuests={() => setTab('quests')} onSettings={() => setTab('settings')} />}
          {onboardingStep === null && tab === 'map' && (
            <MapScreen
              exploring={exploring}
              offline={offline}
              paused={paused}
              seconds={seconds}
              onConnectivity={() => setOffline((value) => !value)}
              onStart={() => { setExploring(true); setSeconds(0); }}
              onPause={() => setPaused((value) => !value)}
              onFinish={() => { setExploring(false); setPaused(false); setLevelUp(true); }}
            />
          )}
          {onboardingStep === null && tab === 'quests' && <QuestsScreen />}
          {onboardingStep === null && tab === 'progress' && <ProgressScreen />}
          {onboardingStep === null && tab === 'settings' && <SettingsScreen onBack={() => setTab('home')} onOnboarding={() => setOnboardingStep(0)} />}
        </div>
        {onboardingStep === null && tab !== 'settings' ? <nav className="grid h-[76px] shrink-0 grid-cols-4 border-t border-[#294153] bg-[#0E1C28] px-1 pb-2 pt-2">
          <Nav active={tab === 'home'} icon={<House size={22} />} label="Domů" onClick={() => setTab('home')} />
          <Nav active={tab === 'map'} icon={<Map size={22} />} label="Mapa" onClick={() => setTab('map')} />
          <Nav active={tab === 'quests'} icon={<Flag size={22} />} label="Výpravy" onClick={() => setTab('quests')} />
          <Nav active={tab === 'progress'} icon={<Trophy size={22} />} label="Pokrok" onClick={() => setTab('progress')} />
        </nav> : null}
        {levelUp ? <LevelUp onClose={() => setLevelUp(false)} /> : null}
      </section>
    </main>
  );
}

function HomeScreen({ onExplore, onQuests, onSettings }: { onExplore: () => void; onQuests: () => void; onSettings: () => void }) {
  return (
    <div className="space-y-4 p-4 pb-8">
      <header className="flex items-center justify-between pt-2">
        <div><p className="text-xs font-bold tracking-[0.22em] text-[#38E68A]">TERRAQUEST</p><h1 className="mt-1 text-2xl font-extrabold">Dobrý večer, průzkumníku</h1></div>
        <button aria-label="Nastavení" onClick={onSettings} className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-400/30 bg-emerald-400/10"><Settings className="text-[#38E68A]" size={25} /></button>
      </header>
      <div className="rounded-[24px] border border-emerald-400/25 bg-gradient-to-br from-[#173729] via-[#102432] to-[#0E1C28] p-5">
        <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-[#38E68A]">Poutník</p><h2 className="mt-1 text-2xl font-bold">Úroveň 7</h2></div><div className="grid h-14 w-14 place-items-center rounded-full bg-[#38E68A] text-xl font-black text-[#04120B]">7</div></div>
        <div className="mt-4 flex justify-between text-xs text-slate-400"><span>600 XP</span><span>1 562 XP</span></div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#1A2E3E]"><div className="h-full w-[38%] rounded-full bg-[#38E68A]" /></div>
        <p className="mt-3 text-xs text-slate-400">Ještě 962 XP do další úrovně.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={<Footprints size={20} />} value="4 832" label="Dnešní kroky" />
        <Metric icon={<MapPin size={20} />} value="42" label="Nové oblasti" amber />
        <Metric icon={<Flame size={20} />} value="6 dní" label="Série" />
      </div>
      <div className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4"><div className="flex justify-between"><div><h3 className="font-bold">Denní cíl</h3><p className="text-xs text-slate-400">4 832 / 6 000 kroků</p></div><strong className="text-xl text-[#38E68A]">81 %</strong></div><Progress value={81} /></div>
      <button onClick={onExplore} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#38E68A] font-extrabold text-[#04120B]"><Compass size={22} />Vyrazit objevovat</button>
      <div className="flex justify-between"><h2 className="text-xl font-bold">Dnešní výpravy</h2><button onClick={onQuests} className="text-sm font-bold text-[#38E68A]">Zobrazit vše</button></div>
      {quests.slice(0, 2).map((quest) => <Quest key={quest[0]} quest={quest} />)}
    </div>
  );
}

function MapScreen({ exploring, offline, paused, seconds, onConnectivity, onStart, onPause, onFinish }: { exploring: boolean; offline: boolean; paused: boolean; seconds: number; onConnectivity: () => void; onStart: () => void; onPause: () => void; onFinish: () => void }) {
  const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  return (
    <div className="relative h-full min-h-[720px] overflow-hidden bg-[#132431]">
      <div className="absolute inset-0 opacity-55 [background-image:linear-gradient(28deg,transparent_46%,#294153_47%,#294153_52%,transparent_53%),linear-gradient(98deg,transparent_46%,#294153_47%,#294153_51%,transparent_52%)] [background-size:110px_130px,145px_120px]" />
      <div className="absolute left-[18%] top-[58%] h-2 w-56 -rotate-45 rounded-full bg-[#38E68A] shadow-[0_0_18px_rgba(56,230,138,0.65)]" />
      <div className="absolute left-[43%] top-[42%] h-2 w-36 rotate-[32deg] rounded-full bg-[#38E68A] shadow-[0_0_18px_rgba(56,230,138,0.65)]" />
      <div className="fog-preview absolute inset-0" />
      <div className="absolute left-1/2 top-[44%] h-7 w-7 -translate-x-1/2 rounded-full border-4 border-white bg-[#38E68A] shadow-[0_0_22px_rgba(56,230,138,0.8)]" />
      <div className="absolute left-4 right-4 top-4 flex justify-between"><div className="rounded-2xl border border-[#294153] bg-[#07111A]/95 px-3 py-2"><p className="text-xs font-bold tracking-widest">TERRAQUEST</p><p className={"mt-1 text-xs font-semibold " + (exploring ? "text-[#38E68A]" : "text-slate-400")}>{exploring ? paused ? 'Pozastaveno' : '● Průzkum aktivní' : 'Připraveno'}</p></div><div className="flex gap-2"><button aria-label="Přepnout připojení" onClick={onConnectivity} className={"grid h-12 w-12 place-items-center rounded-2xl border bg-[#07111A]/95 " + (offline ? "border-[#FFB84D] text-[#FFB84D]" : "border-[#294153]")}><WifiOff size={20} /></button><button aria-label="Vrstvy mapy" className="grid h-12 w-12 place-items-center rounded-2xl border border-[#294153] bg-[#07111A]/95"><Layers size={22} /></button></div></div>
      {offline ? <div className="absolute left-4 right-4 top-20 rounded-xl border border-[#FFB84D]/50 bg-[#332515] px-3 py-2 text-xs font-bold text-[#FFB84D]">Offline režim · trasa se bezpečně uloží a synchronizuje později.</div> : null}
      <div className="absolute bottom-4 left-4 right-4 rounded-[24px] border border-[#294153] bg-[#07111A]/95 p-4">
        {exploring ? <><div className="grid grid-cols-3 gap-3"><Session value={time} label="čas" /><Session value="8" label="nové body" /><Session value="+24" label="čekající XP" active /></div><div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onPause} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#142636] font-bold">{paused ? <Play size={20} /> : <Pause size={20} />}{paused ? 'Pokračovat' : 'Pauza'}</button><button onClick={onFinish} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#FF5D66] font-bold"><Square size={18} />Dokončit</button></div></> : <><h2 className="text-xl font-bold">Co dnes odhalíš?</h2><p className="mt-1 text-sm text-slate-400">Trasa se ukládá lokálně a soutěžní XP potvrdí backend.</p><button onClick={onStart} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#38E68A] font-extrabold text-[#04120B]"><Play size={21} />Zahájit průzkum</button></>}
      </div>
    </div>
  );
}

function QuestsScreen() { return <div className="space-y-4 p-4 pb-8"><p className="pt-2 text-xs font-bold tracking-[0.22em] text-[#38E68A]">VÝPRAVY</p><h1 className="text-3xl font-black">Důvod vyrazit dál</h1><p className="text-sm text-slate-400">Úkoly se přizpůsobí tvému běžnému pohybu a dostupným místům.</p><div className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4"><h3 className="font-bold">Denní série</h3><p className="text-xs text-slate-400">1 ze 3 výprav dokončena</p><Progress value={33} amber /></div>{quests.map((quest) => <Quest key={quest[0]} quest={quest} />)}<p className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4 text-sm text-slate-400">Výpravy nikdy nevedou do označených nebezpečných nebo soukromých míst.</p></div>; }
function ProgressScreen() { return <div className="space-y-4 p-4 pb-8"><p className="pt-2 text-xs font-bold tracking-[0.22em] text-[#38E68A]">POUTNÍK • LEVEL 7</p><h1 className="text-3xl font-black">Petr</h1><div className="rounded-[24px] border border-emerald-400/25 bg-gradient-to-br from-[#163B2B] to-[#102532] p-5"><p className="text-xs font-bold tracking-widest text-[#38E68A]">CELKOVÉ XP</p><p className="mt-1 text-4xl font-black">5 860</p><Progress value={38} /><div className="mt-3 flex justify-between text-xs text-slate-400"><span>Radius 19,5 m</span><span>Další level 6 822 XP</span></div></div><h2 className="text-xl font-bold">Celoživotní mapa</h2><div className="grid grid-cols-2 gap-2"><BigMetric value="12,8 km²" label="Odkrytá plocha" /><BigMetric value="31" label="Objevená místa" /><BigMetric value="184 km" label="Aktivní vzdálenost" /><BigMetric value="47" label="Aktivní dny" /></div><h2 className="text-xl font-bold">Cesta průzkumníka</h2>{['✓ Tulák · 1','✓ Poutník · 5','3 Průzkumník · 10','4 Stopář · 15'].map((rank) => <div key={rank} className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4 font-bold">{rank}</div>)}</div>; }

function SettingsScreen({ onBack, onOnboarding }: { onBack: () => void; onOnboarding: () => void }) { return <div className="space-y-4 p-4"><button onClick={onBack} className="flex items-center gap-2 pt-2 text-sm font-bold text-[#38E68A]"><ChevronLeft size={20} />Zpět</button><p className="text-xs font-bold tracking-[0.22em] text-[#38E68A]">NASTAVENÍ</p><h1 className="text-3xl font-black">Soukromí pod kontrolou</h1><div className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4"><div className="flex items-center gap-3"><ShieldCheck className="text-[#38E68A]" /><div><h2 className="font-bold">Poloha a historie</h2><p className="text-xs text-slate-400">Data trasy zůstávají lokálně, dokud je nepotvrdí backend.</p></div></div></div>{['Soukromé zóny','Export mých dat','Smazat historii','Oznámení a připomínky'].map((item) => <button key={item} className="flex min-h-12 w-full items-center justify-between rounded-2xl border border-[#294153] bg-[#0E1C28] px-4 text-left font-bold"><span>{item}</span><span className="text-slate-500">›</span></button>)}<button onClick={onOnboarding} className="min-h-12 w-full rounded-2xl bg-[#38E68A] font-extrabold text-[#04120B]">Spustit ukázku onboardingu</button></div>; }

function OnboardingScreen({ denied, step, onAllow, onDeny, onDone, onNext }: { denied: boolean; step: number; onAllow: () => void; onDeny: () => void; onDone: () => void; onNext: () => void }) {
  const pages = [
    ['Svět čeká pod mlhou', 'Choď, běhej a bezpečně odkrývej vlastní mapu. Každá cesta zůstane součástí tvého příběhu.'],
    ['Tvoje poloha, tvoje pravidla', 'Trasu můžeš exportovat, smazat a skrýt v soukromých zónách. Soutěžní progres ověřuje backend.'],
    ['Povol polohu při průzkumu', 'TerraQuest potřebuje přesnou polohu jen pro záznam cesty a odkrývání mapy.'],
    ['Vše připraveno', 'První výprava může začít. Bezpečí a soukromí najdeš kdykoliv v nastavení.'],
  ];
  return <div className="flex min-h-full flex-col justify-between p-6"><div><p className="pt-4 text-xs font-bold tracking-[0.22em] text-[#38E68A]">KROK {step + 1} / 4</p><div className="mt-16 grid h-32 w-32 place-items-center rounded-full border border-emerald-400/30 bg-emerald-400/10"><Compass className="text-[#38E68A]" size={64} /></div><h1 className="mt-10 text-4xl font-black leading-tight">{pages[step][0]}</h1><p className="mt-4 text-base leading-7 text-slate-400">{pages[step][1]}</p>{step === 2 && denied ? <div className="mt-5 rounded-2xl border border-[#FF5D66]/50 bg-[#30181D] p-4"><p className="font-bold text-[#FF8A91]">Poloha je zamítnutá</p><p className="mt-1 text-sm text-slate-300">Otevři systémové nastavení nebo pokračuj v omezeném režimu.</p><button onClick={onAllow} className="mt-3 font-bold text-[#38E68A]">Opravit oprávnění</button></div> : null}</div><div className="space-y-2">{step === 2 ? <><button onClick={onAllow} className="min-h-14 w-full rounded-2xl bg-[#38E68A] font-extrabold text-[#04120B]">Povolit při používání</button><button onClick={onDeny} className="min-h-12 w-full rounded-2xl bg-[#142636] font-bold">Teď ne</button></> : <button onClick={step === 3 ? onDone : onNext} className="min-h-14 w-full rounded-2xl bg-[#38E68A] font-extrabold text-[#04120B]">{step === 3 ? 'Vstoupit do TerraQuest' : 'Pokračovat'}</button>}</div></div>;
}

function LevelUp({ onClose }: { onClose: () => void }) { return <div className="absolute inset-0 z-20 grid place-items-center bg-[#04120B]/90 p-6"><div className="w-full rounded-[28px] border border-emerald-400/40 bg-[#102432] p-6 text-center shadow-2xl"><p className="text-xs font-bold tracking-[0.25em] text-[#38E68A]">NOVÁ ÚROVEŇ</p><div className="mx-auto mt-5 grid h-24 w-24 place-items-center rounded-full bg-[#38E68A] text-4xl font-black text-[#04120B]">8</div><h2 className="mt-5 text-3xl font-black">Cesta pokračuje</h2><p className="mt-2 text-sm text-slate-400">Získáváš větší vizuální radius a nový odznak průzkumníka.</p><button onClick={onClose} className="mt-6 min-h-14 w-full rounded-2xl bg-[#38E68A] font-extrabold text-[#04120B]">Pokračovat</button></div></div>; }

function Nav({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) { return <button onClick={onClick} className={"flex flex-col items-center justify-center gap-1 text-[11px] font-bold " + (active ? "text-[#38E68A]" : "text-slate-500")}>{icon}{label}</button>; }
function Metric({ icon, value, label, amber = false }: { icon: React.ReactNode; value: string; label: string; amber?: boolean }) { return <div className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-3"><div className={amber ? "text-[#FFB84D]" : "text-[#38E68A]"}>{icon}</div><strong className="mt-2 block text-lg">{value}</strong><span className="block truncate text-[10px] text-slate-400">{label}</span></div>; }
function Progress({ value, amber = false }: { value: number; amber?: boolean }) { return <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#1A2E3E]"><div className={"h-full rounded-full " + (amber ? "bg-[#FFB84D]" : "bg-[#38E68A]")} style={{ width: Math.min(100, value) + '%' }} /></div>; }
function Quest({ quest }: { quest: typeof quests[number] }) { return <div className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4"><div className="flex justify-between"><div><h3 className="font-bold">{quest[0]}</h3><p className="text-xs text-slate-400">{quest[1]}</p></div><span className="text-xs font-bold text-[#38E68A]">+{quest[3]} XP</span></div><Progress value={quest[2]} /></div>; }
function Session({ value, label, active = false }: { value: string; label: string; active?: boolean }) { return <div><strong className={"block text-xl " + (active ? "text-[#38E68A]" : "")}>{value}</strong><span className="text-[11px] text-slate-400">{label}</span></div>; }
function BigMetric({ value, label }: { value: string; label: string }) { return <div className="rounded-2xl border border-[#294153] bg-[#0E1C28] p-4"><strong className="text-xl text-[#38E68A]">{value}</strong><p className="mt-1 text-xs text-slate-400">{label}</p></div>; }
