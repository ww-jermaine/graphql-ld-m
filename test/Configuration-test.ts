import { Configuration } from '../src/shared/config/Configuration';
import { DataFactory } from 'rdf-data-factory';
import { ContextParser } from 'jsonld-context-parser';

describe('Configuration', () => {
  const mockContext = {
    "@context": {
      "name": "http://schema.org/name",
      "description": "http://schema.org/description"
    }
  };

  it('should create configuration with required fields', () => {
    const config = new Configuration({ context: mockContext });
    expect(config.getConfig()).toHaveProperty('context', mockContext);
  });

  it('should merge with default values', () => {
    const config = new Configuration({ context: mockContext });
    const fullConfig = config.getConfig();
    
    expect(fullConfig).toHaveProperty('dataFactory');
    expect(fullConfig.dataFactory).toBeInstanceOf(DataFactory);
    expect(fullConfig.contextParser).toBeInstanceOf(ContextParser);
    expect(fullConfig.timeout).toBe(30000);
    expect(fullConfig.maxQueryLength).toBe(2000);
    expect(fullConfig.retryAttempts).toBe(3);
    expect(fullConfig.retryDelay).toBe(1000);
    expect(fullConfig.cacheEnabled).toBe(true);
    expect(fullConfig.cacheMaxAge).toBe(300000);
    expect(fullConfig.debug).toBe(false);
  });

  it('should override default values with user config', () => {
    const userConfig = {
      context: mockContext,
      timeout: 5000,
      maxQueryLength: 1000,
      debug: true
    };

    const config = new Configuration(userConfig);
    const fullConfig = config.getConfig();

    expect(fullConfig.timeout).toBe(5000);
    expect(fullConfig.maxQueryLength).toBe(1000);
    expect(fullConfig.debug).toBe(true);
  });

  it('should throw error when context is missing', () => {
    expect(() => new Configuration({} as any)).toThrow('JSON-LD context is required in configuration');
  });

  it('should get specific configuration value', () => {
    const config = new Configuration({ context: mockContext });
    expect(config.get('timeout')).toBe(30000);
    expect(config.get('debug')).toBe(false);
  });

  it('should update configuration values', () => {
    const config = new Configuration({ context: mockContext });
    
    config.update({
      timeout: 10000,
      debug: true
    });

    expect(config.get('timeout')).toBe(10000);
    expect(config.get('debug')).toBe(true);
  });

  it('should preserve immutability in getConfig', () => {
    const config = new Configuration({ context: mockContext });
    const configObj = config.getConfig();
    
    // Attempt to modify the returned config
    configObj.timeout = 1;
    configObj.debug = true;

    // Original config should remain unchanged
    const newConfigObj = config.getConfig();
    expect(newConfigObj.timeout).toBe(30000);
    expect(newConfigObj.debug).toBe(false);
  });
}); 