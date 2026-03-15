import { useContext } from 'react';
import { GlobalTimerContext } from '../contexts/GlobalTimerContext';

export function useGlobalTimer() {
  const ctx = useContext(GlobalTimerContext);
  if (!ctx) {
    throw new Error('useGlobalTimer must be used within GlobalTimerProvider');
  }
  return ctx;
}
