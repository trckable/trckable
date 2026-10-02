// Turning on two-step sign-in, in three steps. It loads only when someone
// starts the setup, so the QR encoder never reaches anyone else.
import { useMemo, useState } from "react";
import { fail, refused, wrong, more } from "../lib/apiMore";
import { DialogActions } from "../components/DialogActions";
import { DialogHead } from "../components/DialogHead";
import { Field } from "../components/Field";
import { Modal } from "../components/Modal";
import { StepBody } from "../components/StepBody";
import { Steps } from "../components/Steps";
import { toast } from "../components/Toast";
import { qr, qrPath } from "../lib/qr";
import './TwoStepSetup.css'

const STEPS = ["Confirm", "Scan", "Save codes"];

/** The secret, in groups of four, which is how people type it. */
const grouped = (s: string) => (s.match(/.{1,4}/g) ?? []).join(" ");

export default function TwoStepSetup({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");
  const [secret, setSecret] = useState("");
  const [uri, setUri] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = () => {
    setBusy(true);
    setErr(null);
    more
      .startTwoStep(password)
      .then((r) => {
        setSecret(r.secret);
        setUri(r.uri);
        setStep(1);
      })
      .catch((e: unknown) => (refused(e) ? setErr(wrong) : fail(e)))
      .finally(() => setBusy(false));
  };

  const enable = () => {
    setBusy(true);
    setErr(null);
    more
      .enableTwoStep(password, code)
      .then((r) => {
        setCodes(r.recovery);
        setStep(2);
        onDone();
      })
      .catch((e: unknown) => (refused(e) ? setErr(wrong) : fail(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      label="Turn on two-step sign-in"
      className="wizard"
      onClose={step < 2 ? onClose : undefined}
    >
      <Steps labels={STEPS} at={step} />

      <StepBody step={step}>
        {step === 0 && (
          <>
            <DialogHead heading="Confirm it's you" hint="Adding a second step asks for your password again." help="It is the one change that could lock you out, so trckable asks even though you are signed in." />
            <Field label="Your password" error={err}>
              {(f) => (
                <input
                  {...f}
                  className="input"
                  type="password"
                  value={password}
                  autoFocus
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && password && start()}
                />
              )}
            </Field>
            <DialogActions
              left={
                <button type="button" className="btn ghost" onClick={onClose}>
                  Cancel
                </button>
              }
            >
              <button
                type="button"
                className="btn primary big"
                disabled={busy || !password}
                onClick={start}
              >
                {busy ? "Checking…" : "Continue"}
              </button>
            </DialogActions>
          </>
        )}

        {step === 1 && (
          <>
            <DialogHead heading="Scan with your app" hint="Any authenticator app works." help="1Password, Bitwarden, Google Authenticator, Aegis. The QR code is drawn in this browser; the secret never goes to a QR service." />
            <div className="totp-setup">
              <QR uri={uri} />
              <div className="totp-manual">
                <span className="faint" style={{ fontSize: 12 }}>
                  Can't scan? Type this key instead:
                </span>
                <button
                  type="button"
                  className="keybox as-button"
                  title="Copy the key"
                  onClick={() =>
                    navigator.clipboard
                      ?.writeText(secret)
                      .then(() => toast("Key copied"))
                  }
                >
                  <code>{grouped(secret)}</code>
                </button>
                <span className="faint" style={{ fontSize: 12 }}>
                  Type: time-based · 6 digits · every 30 seconds
                </span>
              </div>
            </div>
            <Field label="The six digits it shows" error={err}>
              {(f) => (
                <input
                  {...f}
                  className="input num"
                  style={{ fontSize: 18, letterSpacing: "0.25em" }}
                  value={code}
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="123456"
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !busy && enable()}
                />
              )}
            </Field>
            <DialogActions
              left={
                <button type="button" className="btn ghost" onClick={onClose}>
                  Cancel
                </button>
              }
            >
              <button
                type="button"
                className="btn primary big"
                disabled={busy || code.replace(/\D/g, "").length !== 6}
                onClick={enable}
              >
                {busy ? "Checking…" : "Turn it on"}
              </button>
            </DialogActions>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHead heading="Save these somewhere safe" hint="Each signs you in once if you lose your phone." help="This is the only time they are shown: trckable keeps only their hashes." />
            <ol className="recovery">
              {codes.map((c) => (
                <li key={c}>
                  <code>{c}</code>
                </li>
              ))}
            </ol>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  navigator.clipboard
                    ?.writeText(codes.join("\n"))
                    .then(() => toast("Recovery codes copied"))
                }
              >
                Copy all
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const blob = new Blob(
                    [
                      `trckable recovery codes\n\n${codes.join("\n")}\n\nEach code works once.\n`,
                    ],
                    { type: "text/plain" },
                  );
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "trckable-recovery-codes.txt";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                Download
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              I have saved them
            </label>
            <DialogActions>
              <button
                type="button"
                className="btn primary big"
                disabled={!saved}
                onClick={onClose}
              >
                Done
              </button>
            </DialogActions>
          </>
        )}
      </StepBody>
    </Modal>
  );
}

/** Always black on white: scanners struggle with an inverted code. */
function QR({ uri }: { uri: string }) {
  const grid = useMemo(() => qr(uri), [uri]);
  const n = grid.length;
  return (
    <svg
      className="qr"
      viewBox={`-3 -3 ${n + 6} ${n + 6}`}
      role="img"
      aria-label="QR code with your setup key"
      shapeRendering="crispEdges"
    >
      <rect x={-3} y={-3} width={n + 6} height={n + 6} fill="#fff" />
      <path d={qrPath(grid)} fill="#000" />
    </svg>
  );
}
