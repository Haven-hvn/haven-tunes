import { ARKIV_PRESETS } from '../lib/config';
import { useHaven } from '../state/HavenContext';

export function SettingsView() {
  const haven = useHaven();
  const cfg = haven.config;

  return (
    <div className="w2k-panel-scroll">
      <div className="w2k-groupbox">
        <div className="w2k-group-title">Arkiv OP L3 Metadata Network</div>
        <div className="w2k-form-grid">
          <label>Preset</label>
          <select
            className="w2k-input"
            value={cfg.arkivPreset}
            onChange={(e) => {
              const p = e.target.value as 'rabdi' | 'localhost' | 'custom';
              haven.updateConfig({
                arkivPreset: p,
                arkivRpcUrl: p === 'custom' ? cfg.arkivRpcUrl : ARKIV_PRESETS[p].rpcUrl,
              });
            }}
          >
            <option value="rabdi">{ARKIV_PRESETS.rabdi.label}</option>
            <option value="localhost">{ARKIV_PRESETS.localhost.label}</option>
            <option value="custom">Custom Arkiv RPC</option>
          </select>

          <label>RPC URL</label>
          <input
            className="w2k-input w2k-mono"
            value={cfg.arkivRpcUrl}
            onChange={(e) => haven.updateConfig({ arkivPreset: 'custom', arkivRpcUrl: e.target.value })}
          />

          <label>Access Key (optional)</label>
          <input
            className="w2k-input w2k-mono"
            type="password"
            placeholder="Optional Arkiv Hub access key"
            value={cfg.arkivAccessKey}
            onChange={(e) => haven.updateConfig({ arkivAccessKey: e.target.value })}
          />

          <label>IPFS / Filecoin Gateway</label>
          <input
            className="w2k-input w2k-mono"
            value={cfg.ipfsGateway}
            onChange={(e) => haven.updateConfig({ ipfsGateway: e.target.value })}
          />

          <label>Haven-AOL Canister</label>
          <input
            className="w2k-input w2k-mono"
            value={cfg.aolCanisterId}
            onChange={(e) => haven.updateConfig({ aolCanisterId: e.target.value })}
          />

          <label>Demo Synth Library</label>
          <label className="w2k-check">
            <input
              type="checkbox"
              checked={cfg.showDemoTracks}
              onChange={(e) => haven.updateConfig({ showDemoTracks: e.target.checked })}
            />
            Include synthesized demo tracks alongside live Arkiv entities
          </label>
        </div>

        <div className="w2k-actions-row">
          <button className="w2k-btn w2k-btn-primary" onClick={() => void haven.refreshLibrary()}>
            Apply &amp; Rescan Arkiv
          </button>
          {haven.scanError && <span className="w2k-err-text">Last error: {haven.scanError}</span>}
        </div>
      </div>

      <div className="w2k-groupbox">
        <div className="w2k-group-title">Haven-AOL VetKD Keyring ({Object.keys(haven.keyring).length} active)</div>
        {Object.keys(haven.keyring).length === 0 ? (
          <p className="w2k-help">No gate keys unlocked yet. Click "Unlock VetKD" on any token-gated track or DataDAO.</p>
        ) : (
          <>
            <ul className="w2k-key-list">
              {Object.values(haven.keyring).map((k) => (
                <li key={k.gateId}>
                  <code className="w2k-mono">{k.gateId}</code> — Epoch <strong>{k.epoch}</strong> (AES-256-GCM ready)
                </li>
              ))}
            </ul>
            <button className="w2k-btn" onClick={haven.clearKeyring}>
              Lock &amp; Zeroize All Keys
            </button>
          </>
        )}
      </div>
    </div>
  );
}
