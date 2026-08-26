import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from './index';

describe('LoggerService', () => {
  beforeEach(() => {
    Logger.clear();
    Logger.setMinLevel('DEBUG');
  });

  it('should log messages and record in history', () => {
    Logger.info('TestContext', 'User loaded media', { fileName: 'video.mp4' });
    const logs = Logger.getLogs();

    expect(logs.length).toBe(1);
    expect(logs[0].level).toBe('INFO');
    expect(logs[0].context).toBe('TestContext');
    expect(logs[0].message).toBe('User loaded media');
    expect(logs[0].data).toEqual({ fileName: 'video.mp4' });
  });

  it('should respect minimum log level filtering', () => {
    Logger.setMinLevel('WARN');

    Logger.debug('DebugContext', 'This should be ignored');
    Logger.info('InfoContext', 'This should also be ignored');
    Logger.warn('WarnContext', 'This should be logged');
    Logger.error('ErrorContext', 'This error should be logged');

    const logs = Logger.getLogs();
    expect(logs.length).toBe(2);
    expect(logs[0].level).toBe('WARN');
    expect(logs[1].level).toBe('ERROR');
  });

  it('should notify subscribers when new log arrives', () => {
    const subscriber = vi.fn();
    const unsubscribe = Logger.subscribe(subscriber);

    Logger.info('Timeline', 'Playhead moved', { time: 5.2 });
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
    Logger.info('Timeline', 'Playhead stopped');
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});
