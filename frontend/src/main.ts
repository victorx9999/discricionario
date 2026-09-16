import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { configuracaoApp } from './app/app.config';

bootstrapApplication(AppComponent, configuracaoApp).catch((erro) => console.error(erro));
