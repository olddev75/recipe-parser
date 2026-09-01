/**
 * @file public/js/i18n.js
 * @description 10-Language Internationalization (i18n) Module for Recipe Deck V2.0.
 * Dictates translations for English, Spanish, French, German, Italian, Thai, Japanese,
 * Vietnamese, Chinese, and Portuguese UI chrome, modals, tooltips, and buttons.
 */

import store from "./store.js";

export const I18N = {
  en: {
    appSubtitle: "Turn any recipe or photo into clean steps, change serving sizes, and cook step-by-step.",
    importText: "Import Text",
    importWebUrl: "Import Web Link",
    extractPhoto: "Extract from Photo",
    saveBtn: "Save Recipe",
    editRecipe: "Edit Recipe",
    delete: "Delete",
    cookMode: "Cook Mode",
    share: "Share",
    export: "Export",
    favourites: "Favourites",
    servings: "servings",
    prep: "Prep",
    cook: "Cook",
    yield: "Yield",
    ingredients: "Ingredients",
    instructions: "Instructions",
    difficulty: "Difficulty",
    rating: "Rating",
    resetChecks: "Reset Checks",
    help: "Help",
    signIn: "Sign In",
    signOut: "Sign Out",
    accountSettings: "Account Settings",
    userRoles: "User Roles 👑",
    changePassword: "Change Password",
    confirmKeepPrompt: "✨ Newly imported recipe — Do you want to keep this in your collection?",
    confirmKeepBtn: "Keep Recipe",
    confirmDiscardBtn: "Discard"
  },
  es: {
    appSubtitle: "Convierte cualquier receta o foto en pasos limpios, escala porciones y cocina paso a paso.",
    importText: "Importar Texto",
    importWebUrl: "Importar Enlace",
    extractPhoto: "Extraer de Foto",
    saveBtn: "Guardar Receta",
    editRecipe: "Editar Receta",
    delete: "Eliminar",
    cookMode: "Modo Cocina",
    share: "Compartir",
    export: "Exportar",
    favourites: "Favoritos",
    servings: "porciones",
    prep: "Prep.",
    cook: "Cocinar",
    yield: "Rendimiento",
    ingredients: "Ingredientes",
    instructions: "Instrucciones",
    difficulty: "Dificultad",
    rating: "Calificación",
    resetChecks: "Reiniciar Casillas",
    help: "Ayuda",
    signIn: "Iniciar Sesión",
    signOut: "Cerrar Sesión",
    accountSettings: "Configuración de Cuenta",
    userRoles: "Roles de Usuario 👑",
    changePassword: "Cambiar Contraseña",
    confirmKeepPrompt: "✨ Receta recién importada — ¿Deseas conservarla en tu colección?",
    confirmKeepBtn: "Conservar Receta",
    confirmDiscardBtn: "Descartar"
  },
  fr: {
    appSubtitle: "Transformez n'importe quelle recette ou photo en étapes claires, ajustez les portions et cuisinez.",
    importText: "Importer du Texte",
    importWebUrl: "Importer un Lien",
    extractPhoto: "Extraire d'une Photo",
    saveBtn: "Enregistrer",
    editRecipe: "Modifier",
    delete: "Supprimer",
    cookMode: "Mode Cuisson",
    share: "Partager",
    export: "Exporter",
    favourites: "Favoris",
    servings: "portions",
    prep: "Prépa",
    cook: "Cuisson",
    yield: "Portions",
    ingredients: "Ingrédients",
    instructions: "Instructions",
    difficulty: "Difficulté",
    rating: "Note",
    resetChecks: "Réinitialiser",
    help: "Aide",
    signIn: "Se Connecter",
    signOut: "Se Déconnecter",
    accountSettings: "Paramètres du Compte",
    userRoles: "Rôles Utilisateurs 👑",
    changePassword: "Changer le Mot de Passe",
    confirmKeepPrompt: "✨ Recette nouvellement importée — Souhaitez-vous la conserver ?",
    confirmKeepBtn: "Conserver",
    confirmDiscardBtn: "Jeter"
  },
  de: {
    appSubtitle: "Verwandeln Sie jedes Rezept oder Foto in klare Schritte, skalieren Sie Portionen und kochen Sie Schritt für Schritt.",
    importText: "Text Importieren",
    importWebUrl: "Link Importieren",
    extractPhoto: "Aus Foto Extrahieren",
    saveBtn: "Rezept Speichern",
    editRecipe: "Rezept Bearbeiten",
    delete: "Löschen",
    cookMode: "Kochmodus",
    share: "Teilen",
    export: "Exportieren",
    favourites: "Favoriten",
    servings: "Portionen",
    prep: "Zubereitung",
    cook: "Kochen",
    yield: "Ertrag",
    ingredients: "Zutaten",
    instructions: "Anweisungen",
    difficulty: "Schwierigkeit",
    rating: "Bewertung",
    resetChecks: "Zurücksetzen",
    help: "Hilfe",
    signIn: "Anmelden",
    signOut: "Abmelden",
    accountSettings: "Kontoeinstellungen",
    userRoles: "Benutzerrollen 👑",
    changePassword: "Passwort Ändern",
    confirmKeepPrompt: "✨ Neu importiertes Rezept — Möchten Sie dieses in Ihrer Sammlung behalten?",
    confirmKeepBtn: "Rezept Behalten",
    confirmDiscardBtn: "Verwerfen"
  },
  it: {
    appSubtitle: "Trasforma qualsiasi ricetta o foto in passaggi chiari, scala le porzioni e cucina passo dopo passo.",
    importText: "Importa Testo",
    importWebUrl: "Importa Link",
    extractPhoto: "Estrai da Foto",
    saveBtn: "Salva Ricetta",
    editRecipe: "Modifica Ricetta",
    delete: "Elimina",
    cookMode: "Modalità Cucina",
    share: "Condividi",
    export: "Esporta",
    favourites: "Preferiti",
    servings: "porzioni",
    prep: "Prep.",
    cook: "Cottura",
    yield: "Resa",
    ingredients: "Ingredienti",
    instructions: "Istruzioni",
    difficulty: "Difficoltà",
    rating: "Valutazione",
    resetChecks: "Ripristina Spunte",
    help: "Aiuto",
    signIn: "Accedi",
    signOut: "Esci",
    accountSettings: "Impostazioni Account",
    userRoles: "Ruoli Utente 👑",
    changePassword: "Cambia Password",
    confirmKeepPrompt: "✨ Ricetta appena importata — Vuoi conservarla nella tua raccolta?",
    confirmKeepBtn: "Conserva Ricetta",
    confirmDiscardBtn: "Scarta"
  },
  th: {
    appSubtitle: "เปลี่ยนสูตรอาหารหรือรูปภาพให้เป็นขั้นตอนที่ชัดเจน ปรับขนาดเสิร์ฟ และทำอาหารตามขั้นตอน",
    importText: "นำเข้าข้อความ",
    importWebUrl: "นำเข้าลิงก์เว็บ",
    extractPhoto: "สกัดจากรูปภาพ",
    saveBtn: "บันทึกสูตร",
    editRecipe: "แก้ไขสูตร",
    delete: "ลบ",
    cookMode: "โหมดทำอาหาร",
    share: "แชร์",
    export: "ส่งออก",
    favourites: "รายการโปรด",
    servings: "ที่เสิร์ฟ",
    prep: "เตรียม",
    cook: "ปรุง",
    yield: "จำนวนเสิร์ฟ",
    ingredients: "วัตถุดิบ",
    instructions: "ขั้นตอนการทำ",
    difficulty: "ความยาก",
    rating: "คะแนน",
    resetChecks: "รีเซ็ตการติ๊ก",
    help: "ช่วยเหลือ",
    signIn: "เข้าสู่ระบบ",
    signOut: "ออกจากระบบ",
    accountSettings: "ตั้งค่าบัญชี",
    userRoles: "บทบาทผู้ใช้ 👑",
    changePassword: "เปลี่ยนรหัสผ่าน",
    confirmKeepPrompt: "✨ สูตรอาหารที่นำเข้าใหม่ — คุณต้องการเก็บไว้ในคลังของคุณหรือไม่?",
    confirmKeepBtn: "เก็บสูตรไว้",
    confirmDiscardBtn: "ยกเลิก"
  },
  ja: {
    appSubtitle: "あらゆるレシピや写真を明確な手順に変換し、分量を調整してステップバイステップで料理。",
    importText: "テキストをインポート",
    importWebUrl: "Webリンクをインポート",
    extractPhoto: "写真から抽出",
    saveBtn: "レシピを保存",
    editRecipe: "レシピを編集",
    delete: "削除",
    cookMode: "調理モード",
    share: "共有",
    export: "エクスポート",
    favourites: "お気に入り",
    servings: "人前",
    prep: "下準備",
    cook: "調理",
    yield: "出来上がり",
    ingredients: "材料",
    instructions: "作り方",
    difficulty: "難易度",
    rating: "評価",
    resetChecks: "チェックをリセット",
    help: "ヘルプ",
    signIn: "サインイン",
    signOut: "サインアウト",
    accountSettings: "アカウント設定",
    userRoles: "ユーザー権限 👑",
    changePassword: "パスワード変更",
    confirmKeepPrompt: "✨ 新しくインポートされたレシピ — コレクションに保存しますか？",
    confirmKeepBtn: "レシピを保存",
    confirmDiscardBtn: "破棄"
  },
  vi: {
    appSubtitle: "Biến bất kỳ công thức hoặc hình ảnh nào thành các bước rõ ràng, thay đổi khẩu phần và nấu ăn từng bước.",
    importText: "Nhập Văn Bản",
    importWebUrl: "Nhập Liên Kết",
    extractPhoto: "Trích Từ Ảnh",
    saveBtn: "Lưu Công Thức",
    editRecipe: "Sửa Công Thức",
    delete: "Xóa",
    cookMode: "Chế Độ Nấu",
    share: "Chia Sẻ",
    export: "Xuất Dữ Liệu",
    favourites: "Yêu Thích",
    servings: "khẩu phần",
    prep: "Chuẩn bị",
    cook: "Nấu",
    yield: "Thành phẩm",
    ingredients: "Nguyên Liệu",
    instructions: "Các Bước Thực Hiện",
    difficulty: "Độ Khó",
    rating: "Đánh Giá",
    resetChecks: "Đặt Lại Đánh Dấu",
    help: "Trợ Giúp",
    signIn: "Đăng Nhập",
    signOut: "Đăng Xuất",
    accountSettings: "Cài Đặt Tài Khoản",
    userRoles: "Quyền Người Dùng 👑",
    changePassword: "Đổi Mật Khẩu",
    confirmKeepPrompt: "✨ Công thức mới nhập — Bạn có muốn lưu vào bộ sưu tập không?",
    confirmKeepBtn: "Lưu Công Thức",
    confirmDiscardBtn: "Bỏ Qua"
  },
  zh: {
    appSubtitle: "将任何食谱或照片转换为清晰步骤，调整份量，逐步烹饪。",
    importText: "导入文本",
    importWebUrl: "导入网址",
    extractPhoto: "从照片提取",
    saveBtn: "保存食谱",
    editRecipe: "编辑食谱",
    delete: "删除",
    cookMode: "烹饪模式",
    share: "分享",
    export: "导出数据",
    favourites: "收藏夹",
    servings: "份数",
    prep: "准备",
    cook: "烹饪",
    yield: "份量",
    ingredients: "食材清单",
    instructions: "烹饪步骤",
    difficulty: "难度",
    rating: "评分",
    resetChecks: "重置勾选",
    help: "帮助",
    signIn: "登录",
    signOut: "退出登录",
    accountSettings: "账户设置",
    userRoles: "用户权限 👑",
    changePassword: "修改密码",
    confirmKeepPrompt: "✨ 新导入的食谱 — 您想保存在您的收藏库中吗？",
    confirmKeepBtn: "保存食谱",
    confirmDiscardBtn: "放弃"
  },
  pt: {
    appSubtitle: "Transforme qualquer receita ou foto em passos limpos, escale porções e cozinhe passo a passo.",
    importText: "Importar Texto",
    importWebUrl: "Importar Link",
    extractPhoto: "Extrair da Foto",
    saveBtn: "Salvar Receita",
    editRecipe: "Editar Receita",
    delete: "Excluir",
    cookMode: "Modo Cozinhar",
    share: "Compartilhar",
    export: "Exportar",
    favourites: "Favoritos",
    servings: "porções",
    prep: "Prep.",
    cook: "Cozinhar",
    yield: "Rendimento",
    ingredients: "Ingredientes",
    instructions: "Instruções",
    difficulty: "Dificuldade",
    rating: "Avaliação",
    resetChecks: "Reiniciar Marcações",
    help: "Ajuda",
    signIn: "Entrar",
    signOut: "Sair",
    accountSettings: "Configurações de Conta",
    userRoles: "Funções de Usuário 👑",
    changePassword: "Alterar Senha",
    confirmKeepPrompt: "✨ Receita recém-importada — Deseja guardá-la na sua coleção?",
    confirmKeepBtn: "Manter Receita",
    confirmDiscardBtn: "Descartar"
  }
};

/**
 * Gets translation string by key for active site language
 * @param {string} key 
 * @returns {string}
 */
export function t(key) {
  const lang = store.siteLanguage || "en";
  const dict = I18N[lang] || I18N.en;
  return (dict && dict[key]) || (I18N.en && I18N.en[key]) || key;
}

/**
 * Applies active site language translation strings to DOM elements
 * @param {string} lang 
 */
export function applySiteLanguage(lang) {
  store.setSiteLanguage(lang);

  const select = document.getElementById("siteLanguageSelect");
  if (select) select.value = lang;

  const appSubtitle = document.getElementById("appSubtitleText");
  if (appSubtitle) appSubtitle.innerText = t("appSubtitle");

  const saveBtnLabel = document.getElementById("saveBtnLabel");
  if (saveBtnLabel) saveBtnLabel.innerText = t("saveBtn");

  const editBtnLabel = document.getElementById("editRecipeBtnLabel");
  if (editBtnLabel) editBtnLabel.innerText = t("editRecipe");

  const cookModeLabel = document.getElementById("cookModeBtnLabel");
  if (cookModeLabel) cookModeLabel.innerText = t("cookMode");

  const shareLabel = document.getElementById("shareBtnLabel");
  if (shareLabel) shareLabel.innerText = t("share");

  const exportLabel = document.getElementById("exportBtnLabel");
  if (exportLabel) exportLabel.innerText = t("export");

  const helpLabel = document.getElementById("helpBtnLabel");
  if (helpLabel) helpLabel.innerText = t("help");

  const resetChecks = document.getElementById("resetChecksBtn");
  if (resetChecks) resetChecks.innerText = "🔄 " + t("resetChecks");

  const ingSecTitle = document.getElementById("ingredientsSectionTitle");
  if (ingSecTitle) ingSecTitle.innerText = t("ingredients");

  const instSecTitle = document.getElementById("instructionsSectionTitle");
  if (instSecTitle) instSecTitle.innerText = t("instructions");
}

export default { I18N, t, applySiteLanguage };
