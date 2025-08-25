#!/bin/bash

# Script de démarrage rapide KimlandApp
echo "🚀 DÉMARRAGE KIMLAND APP"
echo "========================"

# Installation des dépendances
echo "📦 Installation des dépendances..."
npm install

# Compilation TypeScript
echo "🔨 Compilation TypeScript..."
npm run build

# Démarrage en mode développement  
echo "🔥 Démarrage du serveur..."
npm run dev
