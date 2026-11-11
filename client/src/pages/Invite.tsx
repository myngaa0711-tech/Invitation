import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { apiGet, apiPost } from "../lib/api";
import { getVisitorId } from "../lib/visitor";

import { DATE_OFFERS } from "../lib/dateOffers";
import FloatingHearts from "../components/FloatingHearts";

type InviteConfig = { to: string; from: string; kicker: string; question: string; message: string; };
const FALLBACK: InviteConfig = {
  to: "Энхжин", from: "Myngaa",
  kicker: "Мянгаагаас чамд тавих нэг санал байна 💌",
  question: "Энхжин, надтай болзоонд явах уу?",
  message: "Зүгээр л биеэ бэлдээд хүрээд ир. Юу хийх, хаашаа явах гээд юунд ч санаа зовох хэрэггүй. Миний хажууд тухтай суугаад, тайван амьсгалаад, өөрийнхөөрөө байхад л болно. Чи ирэхэд л тэр өдөр онцгой болно. Бусдыг нь бүгдийг нь надад даатга. 💛",
};
const NO_LABELS = [
  "Үгүй",
  "Барих гээд үз 😌",
  "Арай удаан байна",
  "Дахиад алдчихлаа",
  "Баригдахгүй ээ",
  "Дахиад оролдоорой",
  "Бараг л барилаа",
  "Амжихгүй дээ",
  "Зүгээр л тэгье гэчих 💛",
];

const fade = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -14 },
  transition: { duration: 0.35 },
};

type Stage = "ask" | "details" | "done";

export default function Invite() {
  const [cfg, setCfg] = useState<InviteConfig | null>(null);
  const [stage, setStage] = useState<Stage>("ask");
  const [dodges, setDodges] = useState(0);
  const [presses, setPresses] = useState(0);
  const [noPos, setNoPos] = useState({ x: 0, y: 0 });
  const [offerIds, setOfferIds] = useState<string[]>([]);
  const selected = DATE_OFFERS.filter((offer) => offerIds.includes(offer.id));
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = DATE_OFFERS.find((offer) => offer.id === detailId);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);
  const homeTimer = useRef<number | null>(null);
  const lastDodge = useRef(0);
  const initialResponse = useRef<Promise<unknown> | null>(null);
  const visitorId = useMemo(getVisitorId, []);

  useEffect(() => {
    if (!detailId) {
      dialogRef.current?.close();
      return;
    }
    dialogRef.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [detailId]);

  useEffect(() => {
    apiGet<InviteConfig>("/config")
      .then(setCfg)
      .catch(() => setCfg(FALLBACK));
    return () => {
      if (homeTimer.current) window.clearTimeout(homeTimer.current);
    };
  }, []);

  // While asking: the pointer anywhere on the page drives the "No" button.
  // Near it -> dodge away. Away from it -> snap back to its original spot.
  useEffect(() => {
    if (stage !== "ask") return;
    function onMove(e: PointerEvent) {
      const btn = noRef.current;
      const area = areaRef.current;
      if (!btn || !area) return;
      const b = btn.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const dist = Math.hypot(e.clientX - cx, e.clientY - cy);

      if (dist > 130) {
        setNoPos((p) => (p.x === 0 && p.y === 0 ? p : { x: 0, y: 0 }));
        return;
      }
      const now = performance.now();
      if (now - lastDodge.current < 55) return;
      lastDodge.current = now;

      const a = area.getBoundingClientRect();
      let dx = cx - e.clientX;
      let dy = cy - e.clientY;
      const d = Math.hypot(dx, dy) || 1;
      dx /= d;
      dy /= d;
      const maxX = Math.max(40, a.width / 2 - b.width / 2 - 6);
      setNoPos((prev) => ({
        x: clamp(prev.x + dx * 140 + (Math.random() - 0.5) * 24, -maxX, maxX),
        y: clamp(prev.y + dy * 96, -80, 60),
      }));
      setDodges((v) => v + 1);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [stage]);

  function goHome() {
    setNoPos((prev) => (prev.x === 0 && prev.y === 0 ? prev : { x: 0, y: 0 }));
  }

  function scheduleHome() {
    if (homeTimer.current) window.clearTimeout(homeTimer.current);
    homeTimer.current = window.setTimeout(goHome, 650);
  }

  // Touch / keyboard: shove away from a point, then drift home.
  function shove(fromX: number, fromY: number) {
    const btn = noRef.current;
    const area = areaRef.current;
    if (!btn || !area) return;
    const b = btn.getBoundingClientRect();
    const a = area.getBoundingClientRect();
    let dx = b.left + b.width / 2 - fromX;
    let dy = b.top + b.height / 2 - fromY;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    const maxX = Math.max(40, a.width / 2 - b.width / 2 - 6);
    setNoPos((prev) => ({
      x: clamp(prev.x + dx * 140 + (Math.random() - 0.5) * 24, -maxX, maxX),
      y: clamp(prev.y + dy * 96, -80, 60),
    }));
    setDodges((v) => v + 1);
  }

  function burst() {
    confetti({ particleCount: 130, spread: 95, origin: { y: 0.6 }, scalar: 0.9 });
  }

  function sayYes() {
    burst();
    setStage("details");
    initialResponse.current = apiPost("/response", {
      answer: "yes", dodgeCount: dodges, visitorId,
    }).catch(() => {});
  }

  async function submitDetails() {
    if (saving || selected.length === 0) return;
    setSaveError(null);
    setSaving(true);
    try {
      // Finish the initial answer before saving details so it cannot overwrite them.
      await initialResponse.current;
      await apiPost("/response", {
        answer: "yes",
        chosenSlot: selected.map((offer) => offer.date + " · " + offer.title).join("; "),
        message: note.trim() || null,
        dodgeCount: dodges,
        visitorId,
      });
      burst();
      setStage("done");
    } catch {
      setSaveError("Төлөвлөгөөг илгээж чадсангүй. Дахин оролдоорой.");
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="bg" />;

  // Label stays "No" until an actual press attempt; dodging on cursor
  // approach does not change it.
  const noLabel = NO_LABELS[Math.min(presses, NO_LABELS.length - 1)];

  return (
    <div className="bg">
      <FloatingHearts />

      <motion.main
        className={"card" + (stage === "details" ? " offers-card" : "")}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <AnimatePresence mode="wait">
          {stage === "ask" && (
            <motion.section key="ask" {...fade}>
              <p className="kicker">{cfg.kicker}</p>
              <h1 className="question">{cfg.question}</h1>
              <p className="message">{cfg.message}</p>

              <div className="btnArea" ref={areaRef} onMouseLeave={goHome}>
                <motion.button
                  type="button"
                  className="btn btn-yes"
                  whileTap={{ scale: 0.96 }}
                  onClick={sayYes}
                >
                  Тэгье 💛
                </motion.button>

                <motion.button
                  ref={noRef}
                  type="button"
                  className="btn btn-no"
                  animate={{ x: noPos.x, y: noPos.y }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  onFocus={() => shove(-9999, 0)}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setPresses((p) => p + 1);
                    shove(e.clientX, e.clientY);
                    scheduleHome();
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setPresses((p) => p + 1);
                    const t = e.touches[0];
                    if (t) shove(t.clientX, t.clientY);
                    scheduleHome();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    setPresses((p) => p + 1);
                    shove(-9999, 0);
                  }}
                >
                  {noLabel}
                </motion.button>
              </div>

              {dodges > 2 && (
                <p className="hint">“Үгүй” дарах гэж оролдоод үзэхгүй юу 😌</p>
              )}
            </motion.section>
          )}

          {stage === "details" && (
            <motion.section key="details" {...fade}>
              <p className="kicker">Мянгаагаас · Энхжинд 💌</p>
              <h1 className="question">Хамтдаа бүтээх<br />гоё дурсамжууд</h1>
              <p className="message">Чамд зориулж гурван болзоо бэлдлээ. Таалагдсан өдрүүдээ сонгоорой — гурвууланд нь ч хамт явж болно шүү. 💛</p>
              <fieldset className="offers-fieldset" disabled={saving}>
                <legend>Хоёулангийн болзоог сонгоорой 💛</legend>
                <div className="date-offers">
                  {DATE_OFFERS.map((offer) => (
                    <article className={"offer-card" + (offerIds.includes(offer.id) ? " selected" : "")} key={offer.id}>
                      <img src={offer.image} alt={offer.title + " постер"} className="offer-poster" />
                      <div className="offer-copy">
                        <label className="offer-top"><span className="offer-date"><time dateTime={offer.date}>{offer.label}</time></span><input aria-label={offer.title + " болзоог сонгох"} type="checkbox" value={offer.id} checked={offerIds.includes(offer.id)} onChange={(e) => setOfferIds((ids) => e.target.checked ? [...ids, offer.id] : ids.filter((id) => id !== offer.id))} /></label>
                        <h2>{offer.title}</h2>
                        <button className="offer-select" type="button" aria-haspopup="dialog" onClick={() => setDetailId(offer.id)}>Дэлгэрэнгүй ↗</button>
                      </div>
                    </article>
                  ))}
                </div>
              </fieldset>
              <div className="selection-controls"><p className="selection-count" role="status">{selected.length} / 3 болзоо сонгосон</p><button className="linkish" type="button" disabled={saving} onClick={() => setOfferIds(selected.length === DATE_OFFERS.length ? [] : DATE_OFFERS.map((offer) => offer.id))}>{selected.length === DATE_OFFERS.length ? "Сонголтыг арилгах" : "Гурвууланг нь сонгох ♡"}</button></div>
              <label className="note-label" htmlFor="week-note">Надад хэлэх зүйл байна уу? <span>(заавал биш)</span></label>
              <textarea
                className="note"
                id="week-note"
                disabled={saving}
                rows={3}
                placeholder="Цаг, хүсэл, эсвэл нэг хөөрхөн зурвас…"
                value={note}
                maxLength={400}
                onChange={(e) => setNote(e.target.value)}
              />

              <button
                type="button"
                className="btn btn-yes wide"
                disabled={saving || selected.length === 0}
                onClick={submitDetails}
              >
                {saving ? "Илгээж байна…" : "Сонгосон болзоонуудаа батлах 💌"}
              </button>
              {saveError && <p className="err" role="alert">{saveError}</p>}
            </motion.section>
          )}

          {stage === "done" && (
            <motion.section key="done" {...fade}>
              <p className="kicker">Бидний болзоонууд</p>
              <h1 className="question">Тохирлоо, уулзъя 💛</h1>
              <p className="message">Чамтай уулзах өдрүүдийг тэсэн ядан хүлээж байна.</p>
              {selected.map((offer) => <div className="date-confirmation" key={offer.id}><strong>{offer.label}</strong><p>{offer.title}</p><p>{offer.venue}</p></div>)}
              {note.trim() && <p className="message">“{note.trim()}”</p>}
            </motion.section>
          )}
        </AnimatePresence>
      </motion.main>

      <dialog className="offer-dialog" ref={dialogRef} aria-labelledby="offer-detail-title" onClose={(e) => { if (!e.currentTarget.open) setDetailId(null); }} onCancel={() => setDetailId(null)}
        onPointerDown={(e) => { backdropPress.current = e.target === e.currentTarget; }}
        onClick={(e) => { if (backdropPress.current && e.target === e.currentTarget) setDetailId(null); backdropPress.current = false; }}>
        {detail && <div className="offer-dialog-body">
          <button type="button" className="detail-close" aria-label="Дэлгэрэнгүйг хаах" onClick={() => setDetailId(null)} autoFocus>Хаах ✕</button>
          <img className="detail-poster" src={detail.image} alt={detail.title + " постер"} />
          <p className="kicker">{detail.kind}</p>
          <h2 id="offer-detail-title">{detail.title}</h2>
          <p>{detail.overview}</p>
          <dl>{detail.facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <h3>{detail.id === "special" ? "Lineup" : detail.id === "museum" ? "Юу үзэх вэ?" : "Киноны тухай"}</h3>
          <ul>{detail.highlights.map((item) => <li key={item}>{item}</li>)}</ul>
          <div className="detail-sources"><span>Мэдээллийн эх сурвалж</span>{detail.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div>
        </div>}
      </dialog>

      <a className="peek" href="/dashboard" title="Хариунууд">
        ·
      </a>
    </div>
  );
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
