/**
 * Land System Plugin
 *
 * Struktur folder:
 * plugins/land-system/
 * ├── index.js              <- Entry point (file ini)
 * ├── core/
 * │   ├── LandDatabase.js   <- Database untuk menyimpan data klaim
 * │   ├── LandParticles.js  <- Visualisasi partikel untuk batas klaim
 * │   └── LandProtection.js <- Sistem proteksi land (events, permissions)
 * ├── admin/
 * │   └── LandConfig.js     <- Admin menu untuk konfigurasi land system
 * └── member/
 *     └── LandMember.js     <- Member menu untuk player mengelola land
 *
 * Penggunaan:
 * - Untuk admin menu: import { AdminLandConfig, LandConfig } from './plugins/land-system'
 * - Untuk member menu: import { LandMember } from './plugins/land-system'
 * - Untuk akses database: import { LandDatabase } from './plugins/land-system'
 * - Untuk proteksi: import { LandProtection } from './plugins/land-system'
 */

// Core modules
export { LandDatabase } from './core/LandDatabase.js';
export { LandParticles } from './core/LandParticles.js';
export { LandProtection, isClaimMember, isMemberAllowPvp } from './core/LandProtection.js';

// Admin module
export { LandConfig, AdminLandConfig } from './admin/LandConfig.js';

// Member module
export { LandMember } from './member/LandMember.js';
