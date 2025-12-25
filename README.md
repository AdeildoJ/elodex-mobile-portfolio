# EloDex Mobile (Portfólio) 📱⚡

Aplicação **Mobile** do **EloDex** (versão de portfólio), desenvolvida para interação direta do usuário final, com experiência gamificada inspirada no universo Pokémon.

Este projeto representa a camada **cliente (App)** do produto EloDex, enquanto o painel administrativo é tratado em um repositório Web separado.

> ✅ Repositório público para fins de portfólio.  
> 🔐 Variáveis sensíveis e configurações de produção não são versionadas.

---

## 🎯 Sobre o EloDex Mobile

O EloDex Mobile foi pensado para oferecer ao usuário uma experiência interativa, visual e intuitiva, permitindo:

- Consulta de Pokédex
- Visualização de Pokémon, itens e movimentos
- Interação com regras de jogo e progressão
- Integração com backend e serviços de dados

Nesta versão de portfólio, alguns fluxos podem estar simplificados, mantendo o foco em **arquitetura, organização de código e boas práticas**.

---

## 📱 Principais Funcionalidades

- Interface mobile com navegação estruturada
- Componentização reutilizável
- Consumo de dados dinâmicos
- Integração com serviços externos
- Preparado para autenticação e regras de usuário
- Estrutura pronta para expansão futura

---

## 🏗️ Arquitetura (alto nível)

- **Framework:** React Native (Expo)
- **Linguagem:** TypeScript
- **Estado e Serviços:** organização modular
- **Integração:** APIs e backend do EloDex
- **Padrões:** separação por camadas (app, src, assets)

---

## 🚀 Stack

- React Native
- Expo
- TypeScript
- Firebase (integração preparada)
- Node.js

---

## 🔐 Segurança

Este projeto utiliza variáveis de ambiente.  
Arquivos como `.env`, `.env.local` e `.env.production` **não são versionados**.

📌 Um arquivo `.env.example` é fornecido apenas para referência de configuração.

---

## ▶️ Executando o projeto localmente

1) Instale as dependências:
```bash
npm install
