const SPEED_SETTINGS = {
  MIN: 0.1,
  MAX: 16.0,
  DEFAULT: 1.0,
  DEFAULT_ENABLED: true
};

// 兼容不同环境，将常量暴露到全局
if (typeof window !== 'undefined') {
  window.SPEED_SETTINGS = SPEED_SETTINGS;
}
