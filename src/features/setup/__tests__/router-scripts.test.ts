import { describe, it, expect } from 'vitest';
import {
  buildOnLoginScript,
  buildVmCleanerScript,
  buildVmOpenScript,
  buildVmCloseScript,
  buildVoucherComment,
  parseVoucherComment,
  DEFAULT_OPERATIONAL_HOURS,
} from '../router-scripts';

describe('Router Scripts Generator (KEPUTUSAN TERBARU §5 & §6)', () => {
  it('buildOnLoginScript generates script tagging |u=0 without creating per-user scheduler', () => {
    const script = buildOnLoginScript();
    expect(script).toContain(':local u $user;');
    expect(script).toContain(':local c [/ip hotspot user get [find name=$u] comment];');
    expect(script).toContain('[:find $c "vm|"] >= 0');
    expect(script).toContain('[:find $c "|u="] < 0');
    expect(script).toContain('comment=($c . "|u=0");');
    // Ensure it does NOT create scheduler per user
    expect(script).not.toContain('/system scheduler add');
  });

  it('buildVmCleanerScript includes NTP guard and operational hours check', () => {
    const script = buildVmCleanerScript(DEFAULT_OPERATIONAL_HOURS);
    // Guard NTP: check year >= 2024
    expect(script).toContain('$yr < 2024');
    expect(script).toContain(':error "NTP belum sinkron"');

    // Operational hours: 07:30 is 450 minutes, 14:30 is 870 minutes
    expect(script).toContain('$curTot >= 450 && $curTot < 870');

    // Loop user and increment |u=
    expect(script).toContain('/ip hotspot user find');
    expect(script).toContain('|u=');
    expect(script).toContain('|v=');
    expect(script).toContain(':local newUsed ($usedM + 5);');

    // Kick and remove when expired
    expect(script).toContain('/ip hotspot active remove [find user=$uname]');
    expect(script).toContain('/ip hotspot user remove $u');
  });

  it('buildVmOpenScript cleans leftover logged in users and enables hotspot', () => {
    const script = buildVmOpenScript();
    expect(script).toContain('vm|');
    expect(script).toContain('|u=');
    expect(script).toContain('/ip hotspot user remove $u');
    expect(script).toContain('/ip hotspot set [find disabled=yes] disabled=no');
  });

  it('buildVmCloseScript kicks active sessions, deletes logged in users, disables hotspot', () => {
    const script = buildVmCloseScript();
    expect(script).toContain('/ip hotspot active remove [/ip hotspot active find]');
    expect(script).toContain('/ip hotspot user remove $u');
    expect(script).toContain('/ip hotspot set [find disabled=no] disabled=yes');
  });

  it('buildVoucherComment and parseVoucherComment format and extract metadata accurately', () => {
    const comment = buildVoucherComment('batch-01', 5000, 60);
    expect(comment).toBe('vm|b=batch-01|p=5000|v=60');

    const parsedBeforeLogin = parseVoucherComment(comment);
    expect(parsedBeforeLogin.isVoucher).toBe(true);
    expect(parsedBeforeLogin.batchId).toBe('batch-01');
    expect(parsedBeforeLogin.price).toBe(5000);
    expect(parsedBeforeLogin.validityMinutes).toBe(60);
    expect(parsedBeforeLogin.hasStarted).toBe(false);
    expect(parsedBeforeLogin.usedMinutes).toBeUndefined();

    // After login: |u=0 appended by on-login script
    const commentAfterLogin = `${comment}|u=15`;
    const parsedAfterLogin = parseVoucherComment(commentAfterLogin);
    expect(parsedAfterLogin.isVoucher).toBe(true);
    expect(parsedAfterLogin.hasStarted).toBe(true);
    expect(parsedAfterLogin.usedMinutes).toBe(15);
  });

  it('parseVoucherComment returns isVoucher: false for non-mika comments', () => {
    expect(parseVoucherComment('user biasa')).toEqual({ isVoucher: false, hasStarted: false });
    expect(parseVoucherComment(undefined)).toEqual({ isVoucher: false, hasStarted: false });
  });
});
