const SPEED_SETTINGS = {
  MIN: 0.1,
  MAX: 3.0,
  DEFAULT: 1.0,
  DEFAULT_ENABLED: true,
  PLATFORM_DEFAULTS: {
    bilibili: 1.25,
    youtube: 1.5
  }
};

// 兼容不同环境，将常量暴露到全局
if (typeof window !== 'undefined') {
  window.SPEED_SETTINGS = SPEED_SETTINGS;
}
