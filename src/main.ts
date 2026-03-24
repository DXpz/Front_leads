import './style.css';
import { mountApp } from './app';

void mountApp().catch((err) => {
  console.error(err);
});
