import { Logger, LogLevel } from '../src/shared/monitoring/Logger';

describe('Logger', () => {
  let originalConsole: typeof console;
  let mockConsole: { [key: string]: jest.Mock };
  let logger: Logger;

  beforeEach(() => {
    // Save original console
    originalConsole = global.console;

    // Create mock console methods
    mockConsole = {
      log: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Replace console with mocks
    global.console = mockConsole as any;

    // Create new logger instance with metrics enabled
    logger = Logger.getInstance({
      minLevel: LogLevel.DEBUG,
      enableConsole: true,
      enableMetrics: true,
    });

    // Reset metrics before each test
    logger.resetMetrics();
  });

  afterEach(() => {
    // Restore original console
    global.console = originalConsole;
  });

  describe('log levels', () => {
    it('should log at info level', () => {
      logger.info('Test message');
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test message/)
      );
    });

    it('should log at warn level', () => {
      logger.warn('Test warning');
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[WARN\] Test warning/)
      );
    });

    it('should log at error level', () => {
      const error = new Error('Test error');
      logger.error('Test error message', error);
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] Test error message\nError: Test error/
        )
      );
    });

    it('should log at debug level when enabled', () => {
      logger.debug('Test debug');
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[DEBUG\] Test debug/)
      );
    });

    it('should not log at debug level when disabled', () => {
      const nonDebugLogger = Logger.getInstance({
        minLevel: LogLevel.INFO,
        enableConsole: true,
        enableMetrics: true,
      });
      nonDebugLogger.debug('Test debug');
      expect(mockConsole.debug).not.toHaveBeenCalled();
    });
  });

  describe('context and metadata', () => {
    it('should include metadata in log messages', () => {
      const metadata = { userId: '123', action: 'test' };
      logger.info('Test message', metadata);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test message\nContext: {[\s\S]*"userId": "123"[\s\S]*"action": "test"[\s\S]*}/
        )
      );
    });

    it('should handle nested metadata objects', () => {
      const metadata = {
        user: { id: '123', name: 'Test User' },
        request: { method: 'GET', path: '/test' },
      };
      logger.info('Test message', metadata);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test message\nContext: {[\s\S]*"user": {[\s\S]*"id": "123"[\s\S]*"name": "Test User"[\s\S]*}[\s\S]*"request": {[\s\S]*"method": "GET"[\s\S]*"path": "\/test"[\s\S]*}[\s\S]*}/
        )
      );
    });
  });

  describe('error logging', () => {
    it('should log error objects with stack traces', () => {
      const error = new Error('Test error');
      logger.error('An error occurred', error);
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] An error occurred\nError: Test error\n/
        )
      );
    });

    it('should handle non-Error objects in error logging', () => {
      const customError = { message: 'Custom error', code: 'TEST_ERROR' };
      logger.error('An error occurred', new Error(JSON.stringify(customError)));
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringMatching(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[ERROR\] An error occurred\nError: {"message":"Custom error","code":"TEST_ERROR"}/
        )
      );
    });
  });

  describe('metrics', () => {
    it('should track error metrics', () => {
      logger.error('Test error');
      expect(logger.getMetrics()['errors_total']).toBe(1);
    });

    it('should increment custom metrics', () => {
      logger.incrementMetric('test_metric');
      logger.incrementMetric('test_metric');
      expect(logger.getMetrics()['test_metric']).toBe(2);
    });

    it('should reset metrics', () => {
      logger.incrementMetric('test_metric');
      logger.resetMetrics();
      expect(logger.getMetrics()['test_metric']).toBeUndefined();
    });
  });

  describe('log formatting', () => {
    it('should format timestamps correctly', () => {
      logger.info('Test message');
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test message/)
      );
    });

    it('should handle circular references in metadata', () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj;
      logger.info('Test message', circularObj);
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(
          /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] Test message\nContext: {[\s\S]*"name": "test"[\s\S]*"self": "\[Circular\]"[\s\S]*}/
        )
      );
    });
  });

  describe('log levels configuration', () => {
    it('should respect minimum log level', () => {
      const warnLogger = Logger.getInstance({
        minLevel: LogLevel.WARN,
        enableConsole: true,
        enableMetrics: true,
      });
      warnLogger.info('Should not log');
      warnLogger.warn('Should log');
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should handle invalid log levels gracefully', () => {
      const logger = Logger.getInstance({
        minLevel: 'invalid' as any,
        enableConsole: true,
        enableMetrics: true,
      });
      logger.info('Should still log');
      expect(mockConsole.info).toHaveBeenCalled();
    });
  });
});
