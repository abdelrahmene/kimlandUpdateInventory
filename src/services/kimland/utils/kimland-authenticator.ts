import axios, { AxiosInstance } from 'axios';
import { KimlandCredentials } from '../types/kimland.types';
import { logger } from '../../../utils/logger';

export class KimlandAuthenticator {
  private client: AxiosInstance;
  private isAuthenticated: boolean = false;
  private phpsessid: string = '';

  constructor() {
    this.client = axios.create({
      baseURL: 'https://kimland.dz',
      timeout: 50000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      }
    });
  }

  get httpClient(): AxiosInstance {
    return this.client;
  }

  get sessionId(): string {
    return this.phpsessid;
  }

  /**
   * Extraire PHPSESSID depuis les headers Set-Cookie
   */
  private extractPhpSessionId(setCookieHeaders: string[] | undefined): string {
    if (!setCookieHeaders) return '';
    
    for (const cookie of setCookieHeaders) {
      const match = cookie.match(/PHPSESSID=([^;]+)/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  /**
   * Authentification sur Kimland avec le pattern exact requis
   */
  async authenticate(credentials: KimlandCredentials): Promise<boolean> {
    try {
      logger.info('🔐 Début authentification Kimland', { email: credentials.email });

      // Étape 1: GET initial pour récupérer le premier PHPSESSID
      logger.info('📡 Étape 1: GET initial /app/client/index.php');
      const initialResponse = await this.client.get('/app/client/index.php', {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Priority': 'u=0, i',
          'Te': 'trailers'
        }
      });

      // Extraire le PHPSESSID initial
      const setCookies = initialResponse.headers['set-cookie'];
      this.phpsessid = this.extractPhpSessionId(setCookies);
      
      logger.info('✅ Étape 1 terminée', {
        status: initialResponse.status,
        phpsessid: this.phpsessid,
        contentLength: initialResponse.data.length
      });

      if (!this.phpsessid) {
        logger.error('❌ Aucun PHPSESSID trouvé dans la réponse initiale');
        return false;
      }

      // Étape 2: POST vers /login/ avec le PHPSESSID
      logger.info('📡 Étape 2: POST /app/client/login/');
      const loginData = `user=${encodeURIComponent(credentials.email)}&password=${encodeURIComponent(credentials.password)}&username=${encodeURIComponent(credentials.username)}`;
      
      const loginResponse = await this.client.post('/app/client/login/', loginData, {
        headers: {
          'Cookie': `PHPSESSID=${this.phpsessid}`,
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://kimland.dz',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Priority': 'u=0',
          'Te': 'trailers'
        }
      });

      // Extraire le nouveau PHPSESSID
      const loginSetCookies = loginResponse.headers['set-cookie'];
      const newPhpSessionId = this.extractPhpSessionId(loginSetCookies);
      
      logger.info('✅ Étape 2 terminée', {
        status: loginResponse.status,
        responseData: loginResponse.data
      });

      if (loginResponse.status !== 200) {
        logger.error('❌ Échec POST login', { status: loginResponse.status, data: loginResponse.data });
        return false;
      }
      
      // Vérifier que la réponse de login est valide
      const loginResponseText = String(loginResponse.data).trim();
      if (loginResponseText !== '2' && loginResponseText !== '1' && loginResponseText !== 'success') {
        logger.warn('⚠️ Réponse login inattendue', { loginResponseText, expected: '2' });
      }

      // Mettre à jour le PHPSESSID si un nouveau a été fourni
      if (newPhpSessionId) {
        this.phpsessid = newPhpSessionId;
      }

      // Étape 3: GET final avec le PHPSESSID pour vérifier la connexion
      logger.info('📡 Étape 3: GET final /app/client/index.php avec nouveau PHPSESSID');
      const finalResponse = await this.client.get('/app/client/index.php', {
        headers: {
          'Cookie': `PHPSESSID=${this.phpsessid}`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Priority': 'u=0, i',
          'Te': 'trailers'
        }
      });

      logger.info('✅ Étape 3 terminée', {
        status: finalResponse.status,
        contentLength: finalResponse.data.length
      });

      // Vérifier le succès de la connexion
      if (finalResponse.status === 200) {
        const loginResponseText = String(loginResponse.data).trim();
        const isLoginSuccessful = loginResponseText === '2' || loginResponseText === '1' || loginResponseText === 'success';
        
        // Indicateurs d'authentification réussie
        const hasAuthenticatedContent = finalResponse.data.includes('getSessionData') ||
                                       finalResponse.data.includes('function(') ||
                                       finalResponse.data.includes('$(document).ready') ||
                                       finalResponse.data.includes('DataTable') ||
                                       finalResponse.data.includes('dashboard') ||
                                       finalResponse.data.includes('App/Content/views') ||
                                       finalResponse.data.includes('.InitialBlock');
        
        // Indicateurs qu'on est toujours sur la page de login (non authentifié)
        const isStillOnLoginPage = finalResponse.data.includes('Connecter a votre compte') &&
                                  finalResponse.data.includes('Pour accÃ©der comme un') &&
                                  finalResponse.data.includes('veuillez saisir l\'adresse email');
        
        const seemsAuthenticated = isLoginSuccessful && hasAuthenticatedContent && !isStillOnLoginPage;
        
        logger.info('🔍 Analyse finale de la connexion', {
          loginResponseText,
          isLoginSuccessful,
          hasAuthenticatedContent,
          isStillOnLoginPage,
          seemsAuthenticated
        });
        
        if (seemsAuthenticated) {
          this.isAuthenticated = true;
          logger.info('✅ Authentification Kimland réussie');
          return true;
        }
      }
      
      logger.error('❌ Échec authentification Kimland');
      return false;

    } catch (error) {
      logger.error('❌ Erreur authentification Kimland', { 
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }

  /**
   * Vérifier si connecté
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Déconnexion
   */
  logout(): void {
    this.isAuthenticated = false;
    this.phpsessid = '';
    logger.info('🔐 Déconnexion Kimland');
  }
}
