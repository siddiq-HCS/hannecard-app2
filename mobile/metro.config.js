// استيراد ملفات .wasm المطلوبة لـ expo-sqlite على الويب (wa-sqlite)
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('wasm');

module.exports = config;