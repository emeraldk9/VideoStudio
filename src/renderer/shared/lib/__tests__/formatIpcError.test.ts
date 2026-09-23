import { describe, expect, it } from 'vitest';

import { formatIpcError } from '../formatIpcError';

describe('formatIpcError', () => {
  it('strips Electron remote method invocation wrapper with single quotes', () => {
    const raw = "Error: Error invoking remote method 'queue:enqueueBatch': Error: Disk full";
    expect(formatIpcError(new Error(raw))).toBe('Disk full');
  });

  it('strips Electron remote method invocation wrapper when passed as raw string', () => {
    const raw = "Error invoking remote method 'sequence:replaceClips': Error: Invalid IPC payload: clips.0.effects";
    expect(formatIpcError(raw)).toBe('Invalid IPC payload: clips.0.effects');
  });

  it('strips multiple repeated Error prefixes', () => {
    const raw = 'Error: Error: Error: Something broke';
    expect(formatIpcError(raw)).toBe('Something broke');
  });

  it('strips Electron remote method without inner Error prefix', () => {
    const raw = "Error invoking remote method 'projects:create': Project name too long";
    expect(formatIpcError(new Error(raw))).toBe('Project name too long');
  });

  it('strips ElectronRemoteError prefix if present', () => {
    const raw = 'ElectronRemoteError: Error: Network timeout';
    expect(formatIpcError(raw)).toBe('Network timeout');
  });

  it('handles objects with message property', () => {
    const obj = { message: "Error invoking remote method 'test': Failed to write file" };
    expect(formatIpcError(obj)).toBe('Failed to write file');
  });

  it('falls back to default fallback when input is empty or nullish', () => {
    expect(formatIpcError(null)).toBe('Something went wrong.');
    expect(formatIpcError(undefined)).toBe('Something went wrong.');
    expect(formatIpcError('')).toBe('Something went wrong.');
    expect(formatIpcError(new Error(''))).toBe('Something went wrong.');
  });

  it('falls back to custom fallback when input is empty', () => {
    expect(formatIpcError(null, 'Custom fallback')).toBe('Custom fallback');
    expect(formatIpcError("Error invoking remote method 'test': Error:   ", 'Custom fallback')).toBe(
      'Custom fallback',
    );
  });

  it('preserves clean messages that do not have IPC wrappers', () => {
    expect(formatIpcError('File not found')).toBe('File not found');
    expect(formatIpcError(new Error('Out of memory'))).toBe('Out of memory');
  });
});
