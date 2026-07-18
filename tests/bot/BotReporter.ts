/**
 * BotReporter.ts — generates an HTML report from bot run results.
 *
 * Usage:
 *   const reporter = new BotReporter('creative-smoke');
 *   reporter.addStep(step);
 *   reporter.write();  // saves tests/bot/reports/<timestamp>-<scenario>.html
 */

import fs   from 'fs';
import path from 'path';
import type { GameBotStep } from './GameBot';

export class BotReporter {
  private _steps: GameBotStep[] = [];
  private _startTime = Date.now();

  constructor(private readonly scenario: string) {}

  addStep(step: GameBotStep): void { this._steps.push(step); }
  addSteps(steps: GameBotStep[]): void { steps.forEach(s => this._steps.push(s)); }

  get passed(): number { return this._steps.filter(s => s.status === 'pass').length; }
  get failed(): number { return this._steps.filter(s => s.status === 'fail').length; }

  /** Write HTML report to tests/bot/reports/ and return the file path. */
  write(): string {
    const dir = path.join('tests', 'bot', 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const file = path.join(dir, `${ts}-${this.scenario}.html`);

    const duration = ((Date.now() - this._startTime) / 1000).toFixed(1);
    const allPass  = this.failed === 0;

    const stepRows = this._steps.map(s => {
      const icon = s.status === 'pass' ? '✓' : s.status === 'fail' ? '✗' : '—';
      const color = s.status === 'pass' ? '#44bb88' : s.status === 'fail' ? '#ff6666' : '#888';
      const ss    = s.screenshot
        ? `<img src="${path.resolve(s.screenshot)}" style="max-width:100%;border-radius:4px;margin-top:8px" />`
        : '';
      const err   = s.error ? `<pre style="color:#ff9999;font-size:10px;margin:4px 0;white-space:pre-wrap">${s.error}</pre>` : '';
      return `
        <tr>
          <td style="color:${color};font-size:18px;padding:8px 12px">${icon}</td>
          <td style="padding:8px 12px"><strong>${s.name}</strong>${err}${ss}</td>
          <td style="padding:8px 12px;color:#888;font-size:11px;white-space:nowrap">${s.durationMs}ms</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Bot Report — ${this.scenario}</title>
  <style>
    body { background:#0e0c18; color:#c0a0f0; font-family:'Segoe UI',system-ui,sans-serif; margin:0; padding:20px; }
    h1   { color:${allPass ? '#44bb88' : '#ff6666'}; margin-bottom:4px; }
    .meta { color:#665588; font-size:12px; margin-bottom:20px; }
    table { border-collapse:collapse; width:100%; }
    tr { border-bottom:1px solid #1e1a30; }
    tr:last-child { border-bottom:none; }
    td { vertical-align:top; }
    .summary { background:${allPass ? 'rgba(40,120,80,0.2)' : 'rgba(120,40,40,0.2)'}; border:1px solid ${allPass ? '#44bb88' : '#ff6666'}; border-radius:6px; padding:10px 16px; margin-bottom:16px; font-size:14px; }
  </style>
</head>
<body>
  <h1>${allPass ? '✓ All Passed' : '✗ Some Failed'} — ${this.scenario}</h1>
  <div class="meta">Run at ${new Date().toLocaleString()} · ${duration}s total</div>
  <div class="summary">
    <strong>${this.passed}</strong> passed &nbsp;·&nbsp; <strong>${this.failed}</strong> failed &nbsp;·&nbsp; ${this._steps.length} total
  </div>
  <table>${stepRows}</table>
</body>
</html>`;

    fs.writeFileSync(file, html, 'utf8');
    console.log(`  📄  Report: ${file}`);
    return file;
  }
}
