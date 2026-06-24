import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import esCommon from './locales/es/common.json';

/**
 * i18n bootstrap. Spanish (es-ES) is the only locale in v1, but all UI strings go through
 * i18next so adding languages later needs no component changes. See spec §12.
 */
void i18n.use(initReactI18next).init({
  lng: 'es',
  fallbackLng: 'es',
  defaultNS: 'common',
  resources: {
    es: { common: esCommon },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
