const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
    setup() {
        const isLoggedIn = ref(false);
        const currentUser = ref('');
        const currentPage = ref('dashboard');
        const loading = ref(false);
        const toast = reactive({ show: false, message: '', type: 'success' });
        const modal = reactive({ show: false, title: '', content: '', onConfirm: null });
        const loginForm = reactive({ username: 'adsadmin', password: 'Mm123567..' });
        const loginError = ref('');
        const sites = ref([]);
        const searchQuery = ref('');
        const filteredSites = computed(() => {
            if (!searchQuery.value) return sites.value;
            const q = searchQuery.value.toLowerCase();
            return sites.value.filter(s =>
                (s.site_name || '').toLowerCase().includes(q) ||
                (s.url || '').toLowerCase().includes(q) ||
                (s.tag || '').toLowerCase().includes(q)
            );
        });
        const panelConnected = ref(false);
        const panelWebsites = ref([]);
        const panelInstalledApps = ref([]);
        const panelGroups = ref([]);

        // ---- 3-Step Wizard ----
        const wizardStep = ref(1);
        const wizardOpen = ref(false);
        const wizardMode = ref('single');
        const wizardSiteId = ref(null);
        const createForm = reactive({
            site_name: '', url: '', admin_name: 'admin', admin_password: '',
            tag: '', security_id: '', http_username: '', http_password: '',
            verify_certificate: true, ssl_version: 'auto',
            domains: '', base_port: 8081, db_service: 'mariadb', website_group_id: 1,
        });
        const createProgress = reactive({ show: false, message: '', results: [] });
        const wpInstallStatuses = reactive({});
        const wpPollingTimers = reactive({});

        // Step 2
        const themes = ref([]);
        const selectedThemeIds = ref([]);
        const selectedPluginIds = ref([]);
        const step2Installing = ref(false);
        const step2Results = ref([]);

        // Step 2 - Cloudflare DNS
        const cfConnected = ref(false);
        const cfToken = ref('');
        const cfEmail = ref('');
        const cfKey = ref('');
        const cfAuthMode = ref('token'); // 'token' or 'global'
        const cfZones = ref([]);
        const cfSelectedZone = ref('');
        const cfDnsName = ref('');
        const cfProxied = ref(false);
        const cfServerIp = ref('');
        const cfCreating = ref(false);
        const cfDnsResult = ref(null);
        const cfAccounts = ref([]);
        const cfSelectedAccountId = ref('');
        // DNS records list + edit
        const cfDnsRecords = ref([]);
        const cfDnsLoading = ref(false);
        const cfDnsPage = ref(1);
        const cfDnsPerPage = ref(10);
        const cfDnsTotal = ref(0);
        const cfDnsTotalPages = computed(() => Math.max(1, Math.ceil(cfDnsTotal.value / cfDnsPerPage.value)));
        const cfSelectedDnsRecords = ref([]);
        const cfEditingRecord = ref(null);
        const cfEditForm = reactive({ type: 'A', name: '', content: '', ttl: 1, proxied: false });

        // Step 3 - WordPress.com
        const wpcomConnected = ref(false);
        const wpcomEmail = ref('');
        const wpcomBinding = ref(false);
        const wpcomDomain = ref('');
        const wpcomResult = ref(null);

        // Edit
        const showEditModal = ref(false);
        const editForm = reactive({});
        const editingSiteId = ref('');

        // Plugins
        const plugins = ref([]);
        const uploadProgress = ref(0);

        // Feed Products (GMC)
        const feedSiteId = ref('');
        const feedProducts = ref([]);
        const showFeedProductModal = ref(false);
        const feedEditId = ref(null);
        const feedEditForm = reactive({
            title: '', description: '', price: '', currency: 'USD',
            availability: 'in_stock', brand: '', gtin: '', mpn: '',
            google_product_category: '', product_type: '',
            image_url: '', link: '', condition: 'new', shipping: '',
        });

        // Config
        const globalConfig = reactive({
            default_admin_name: 'admin', default_admin_password: '',
            default_plugins: [], default_themes: [], db_service: 'mariadb',
        });

        // ---- Utility ----
        function showToast(message, type = 'success') {
            toast.message = message; toast.type = type; toast.show = true;
            setTimeout(() => { toast.show = false; }, 3000);
        }
        function showModal(title, content, onConfirm) {
            modal.title = title; modal.content = content; modal.onConfirm = onConfirm; modal.show = true;
        }
        function formatSize(bytes) {
            if (!bytes) return '0 B';
            const k = 1024; const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        // ---- Auth ----
        async function handleLogin() {
            loginError.value = ''; loading.value = true;
            try {
                const resp = await API.login(loginForm.username, loginForm.password);
                if (resp.code === 200) { isLoggedIn.value = true; currentUser.value = resp.data.username; showToast('登录成功'); loadInitialData(); }
                else { loginError.value = resp.message || '用户名或密码错误'; }
            } catch (e) { loginError.value = '连接错误'; } finally { loading.value = false; }
        }
        function handleLogout() { API.logout(); isLoggedIn.value = false; currentUser.value = ''; currentPage.value = 'dashboard'; }

        // ---- Data ----
        async function loadInitialData() {
            loading.value = true;
            try { await Promise.all([loadSites(), checkPanelStatus(), loadPanelData(), loadConfig(), loadPlugins(), loadThemes(), loadCfAccounts(), checkCfStatus()]); }
            finally { loading.value = false; }
        }
        async function loadSites() {
            try { const resp = await API.getSites(); if (resp.code === 200) sites.value = resp.data || []; } catch (e) {}
        }
        async function checkPanelStatus() {
            try { const resp = await API.panelStatus(); panelConnected.value = resp.data?.connected || false; } catch (e) { panelConnected.value = false; }
        }
        async function loadPanelData() {
            try {
                const [w, i, g] = await Promise.all([API.panelSearchWebsites(), API.panelSearchInstalled(), API.panelSearchGroups()]);
                if (w.code === 200) panelWebsites.value = w.data?.items || [];
                if (i.code === 200) panelInstalledApps.value = i.data?.items || [];
                if (g.code === 200) panelGroups.value = g.data || [];
            } catch (e) {}
        }
        async function loadConfig() {
            try { const resp = await API.getConfig(); if (resp.code === 200) { Object.assign(globalConfig, resp.data); createForm.admin_name = resp.data.default_admin_name || 'admin'; createForm.db_service = resp.data.db_service || 'mariadb'; } } catch (e) {}
        }
        async function refreshSites() {
            loading.value = true;
            try { await Promise.all([loadSites(), loadPanelData()]); showToast('数据已刷新'); } finally { loading.value = false; }
        }

        async function syncWithPanel() {
            loading.value = true;
            try {
                const resp = await API.panelSync(true);
                if (resp.code === 200) {
                    const d = resp.data;
                    let msg = `同步完成: 更新${d.updated}个, 清理${d.cleared}个`;
                    if (d.imported) msg += `, 导入${d.imported}个`;
                    if (d.orphaned_wp_apps > 0) msg += `, 发现${d.orphaned_wp_apps}个未关联网站的WordPress应用`;
                    if (d.errors && d.errors.length) msg += `, ${d.errors.length}个错误`;
                    showToast(msg);
                    await loadSites();
                } else { showToast(resp.message || '同步失败', 'error'); }
            } catch (e) { showToast('同步失败', 'error'); } finally { loading.value = false; }
        }

        // ---- Plugins ----
        async function loadPlugins() {
            try { const resp = await API.getPlugins(); if (resp.code === 200) plugins.value = resp.data || []; } catch (e) {}
        }
        async function handlePluginUpload(event) {
            const file = event.target.files[0]; if (!file) return;
            if (!file.name.endsWith('.zip')) { showToast('仅支持.zip格式', 'error'); return; }
            const formData = new FormData(); formData.append('file', file); formData.append('name', file.name.replace('.zip', ''));
            try { const resp = await API.uploadPlugin(formData); if (resp.code === 200) { showToast('插件上传成功'); await loadPlugins(); } else { showToast(resp.message || '上传失败', 'error'); } } catch (e) { showToast('上传失败', 'error'); } finally { event.target.value = ''; }
        }
        async function handleDeletePlugin(plugin) {
            if (!confirm(`确定删除插件 "${plugin.name}"?`)) return;
            try { await API.deletePlugin(plugin.id); showToast('插件已删除'); await loadPlugins(); } catch (e) { showToast('删除失败', 'error'); }
        }
        async function handleTogglePlugin(plugin) {
            try { await API.togglePlugin(plugin.id); await loadPlugins(); } catch (e) { showToast('操作失败', 'error'); }
        }

        // ---- Themes ----
        async function loadThemes() {
            try { const resp = await API.getThemes(); if (resp.code === 200) themes.value = resp.data || []; } catch (e) {}
        }
        async function handleThemeUpload(event) {
            const file = event.target.files[0]; if (!file) return;
            if (!file.name.endsWith('.zip')) { showToast('仅支持.zip格式', 'error'); return; }
            const formData = new FormData(); formData.append('file', file); formData.append('name', file.name.replace('.zip', ''));
            try { const resp = await API.uploadTheme(formData); if (resp.code === 200) { showToast('主题上传成功'); await loadThemes(); } else { showToast(resp.message || '上传失败', 'error'); } } catch (e) { showToast('上传失败', 'error'); } finally { event.target.value = ''; }
        }
        async function handleDeleteTheme(theme) {
            if (!confirm(`确定删除主题 "${theme.name}"?`)) return;
            try { await API.deleteTheme(theme.id); showToast('主题已删除'); await loadThemes(); } catch (e) { showToast('删除失败', 'error'); }
        }

        // ---- Feed Products (GMC) ----
        async function loadFeedProducts() {
            if (!feedSiteId.value) { feedProducts.value = []; return; }
            try { const resp = await API.getFeedProducts(feedSiteId.value); if (resp.code === 200) feedProducts.value = resp.data || []; } catch (e) {}
        }
        function openFeedProductModal(product) {
            if (product) {
                feedEditId.value = product.id;
                Object.assign(feedEditForm, product);
            } else {
                feedEditId.value = null;
                Object.keys(feedEditForm).forEach(k => feedEditForm[k] = k === 'currency' ? 'USD' : k === 'availability' ? 'in_stock' : k === 'condition' ? 'new' : '');
            }
            showFeedProductModal.value = true;
        }
        function closeFeedProductModal() { showFeedProductModal.value = false; }
        async function handleSaveFeedProduct() {
            if (!feedEditForm.title.trim()) { showToast('商品标题不能为空', 'error'); return; }
            try {
                let resp;
                if (feedEditId.value) {
                    resp = await API.updateFeedProduct(feedEditId.value, feedEditForm);
                } else {
                    resp = await API.createFeedProduct(feedSiteId.value, feedEditForm);
                }
                if (resp.code === 200) { showToast(feedEditId.value ? '商品已更新' : '商品已添加'); closeFeedProductModal(); await loadFeedProducts(); }
                else { showToast(resp.message || '操作失败', 'error'); }
            } catch (e) { showToast('操作失败', 'error'); }
        }
        async function handleDeleteFeedProduct(product) {
            if (!confirm(`确定删除商品 "${product.title}"?`)) return;
            try { await API.deleteFeedProduct(product.id); showToast('商品已删除'); await loadFeedProducts(); } catch (e) { showToast('删除失败', 'error'); }
        }
        async function handleImportSampleProducts() {
            if (!feedSiteId.value) { showToast('请先选择一个站点', 'error'); return; }
            try {
                const resp = await API.createSampleFeedProducts(feedSiteId.value);
                if (resp.code === 200) { showToast(resp.message || '示例商品已导入'); await loadFeedProducts(); }
                else { showToast(resp.message || '导入失败', 'error'); }
            } catch (e) { showToast('导入失败', 'error'); }
        }
        async function handleExportFeed() {
            if (!feedSiteId.value) { showToast('请先选择一个站点', 'error'); return; }
            try { await API.exportFeedProducts(feedSiteId.value); showToast('Feed XML 已导出'); } catch (e) { showToast('导出失败', 'error'); }
        }

        // ---- Cloudflare ----
        async function loadCfAccounts() {
            try { const resp = await API.cfListAccounts(); if (resp.code === 200) cfAccounts.value = resp.data || []; } catch (e) {}
        }
        async function checkCfStatus() {
            const accountId = cfSelectedAccountId.value;
            try { const resp = await API.cfStatus(accountId || undefined); cfConnected.value = resp.data?.connected || false; } catch (e) { cfConnected.value = false; }
        }
        async function cfVerify() {
            loading.value = true;
            try {
                let resp;
                if (cfAuthMode.value === 'token') {
                    if (!cfToken.value.trim()) { showToast('请输入Cloudflare API Token', 'error'); loading.value = false; return; }
                    resp = await API.cfVerifyToken(cfToken.value.trim());
                } else {
                    if (!cfEmail.value.trim() || !cfKey.value.trim()) { showToast('请输入邮箱和Global API Key', 'error'); loading.value = false; return; }
                    resp = await API.cfVerifyGlobalKey(cfEmail.value.trim(), cfKey.value.trim());
                }
                if (resp.code === 200) { cfConnected.value = true; showToast('Cloudflare授权成功'); await loadCfAccounts(); await loadCfZones(); }
                else { showToast(resp.message || '验证失败', 'error'); }
            } catch (e) { showToast('验证失败', 'error'); } finally { loading.value = false; }
        }
        async function loadCfZones() {
            const accountId = cfSelectedAccountId.value;
            try { const resp = await API.cfListZones(accountId || undefined); if (resp.code === 200) cfZones.value = resp.data || []; } catch (e) {}
        }
        async function loadCfDnsRecords(page = 1) {
            if (!cfSelectedZone.value) { cfDnsRecords.value = []; return; }
            cfDnsLoading.value = true;
            cfDnsPage.value = page;
            try {
                const accountId = cfSelectedAccountId.value;
                const resp = await API.cfListDnsRecords(cfSelectedZone.value, accountId || undefined, page, cfDnsPerPage.value);
                if (resp.code === 200) {
                    cfDnsRecords.value = resp.data || [];
                    cfDnsTotal.value = resp.total || 0;
                }
            } catch (e) { cfDnsRecords.value = []; }
            finally { cfDnsLoading.value = false; }
        }
        function cfGoToPage(page) { loadCfDnsRecords(page); }
        function cfToggleDnsSelect(record) {
            const idx = cfSelectedDnsRecords.value.findIndex(r => r.id === record.id);
            if (idx >= 0) {
                cfSelectedDnsRecords.value = cfSelectedDnsRecords.value.filter(r => r.id !== record.id);
            } else {
                cfSelectedDnsRecords.value = [...cfSelectedDnsRecords.value, record];
            }
        }
        function cfStartEditRecord(record) {
            cfEditingRecord.value = record;
            cfEditForm.type = record.type || 'A';
            cfEditForm.name = record.name || '';
            cfEditForm.content = record.content || '';
            cfEditForm.ttl = record.ttl || 1;
            cfEditForm.proxied = record.proxied || false;
        }
        function cfCancelEdit() { cfEditingRecord.value = null; }
        async function cfSaveEditRecord() {
            if (!cfEditingRecord.value) return;
            cfCreating.value = true;
            try {
                const accountId = cfSelectedAccountId.value;
                const resp = await API.cfUpdateDnsRecord(cfSelectedZone.value, cfEditingRecord.value.id, {
                    type: cfEditForm.type, name: cfEditForm.name,
                    content: cfEditForm.content, ttl: parseInt(cfEditForm.ttl) || 1,
                    proxied: cfEditForm.proxied,
                }, accountId || undefined);
                if (resp.code === 200) { showToast('DNS记录已更新'); cfEditingRecord.value = null; await loadCfDnsRecords(); }
                else { showToast(resp.message || '更新失败', 'error'); }
            } catch (e) { showToast('更新失败', 'error'); } finally { cfCreating.value = false; }
        }
        async function cfDeleteDnsRecord(record) {
            if (!confirm(`确定删除 DNS 记录 "${record.name}"？`)) return;
            cfCreating.value = true;
            try {
                const accountId = cfSelectedAccountId.value;
                const resp = await API.cfDeleteDnsRecord(cfSelectedZone.value, record.id, accountId || undefined);
                if (resp.code === 200) { showToast('DNS记录已删除'); await loadCfDnsRecords(); }
                else { showToast(resp.message || '删除失败', 'error'); }
            } catch (e) { showToast('删除失败', 'error'); } finally { cfCreating.value = false; }
        }
        async function cfCreateDns() {
            if (!cfSelectedZone.value) { showToast('请先选择域名区域', 'error'); return; }
            if (!cfDnsName.value.trim()) { showToast('请输入DNS记录名称', 'error'); return; }
            cfCreating.value = true;
            try {
                const data = { type: 'A', name: cfDnsName.value.trim(), content: cfServerIp.value, ttl: 1, proxied: cfProxied.value };
                if (cfSelectedAccountId.value) data.account_id = cfSelectedAccountId.value;
                const resp = await API.cfCreateDnsRecord(cfSelectedZone.value, data);
                if (resp.code === 200) { cfDnsResult.value = resp.data; showToast('DNS A记录创建成功！'); await loadCfDnsRecords(); }
                else { showToast(resp.message || 'DNS创建失败', 'error'); }
            } catch (e) { showToast('DNS创建失败', 'error'); } finally { cfCreating.value = false; }
        }
        async function handleDeleteCfAccount(id) {
            if (!confirm('确定删除此Cloudflare账号？')) return;
            const resp = await API.cfDeleteAccount(id);
            if (resp.code === 200) { showToast('账号已删除'); await loadCfAccounts(); } else { showToast(resp.message || '删除失败', 'error'); }
        }
        async function handleSetDefaultCfAccount(id) {
            const resp = await API.cfSetDefaultAccount(id);
            if (resp.code === 200) { showToast('已设为默认账号'); await loadCfAccounts(); } else { showToast(resp.message || '设置失败', 'error'); }
        }

        // ---- WordPress.com Functions ----
        async function checkWpcomStatus() {
            try { const r = await API.wpcomStatus(); if (r.code === 200) { wpcomConnected.value = r.data.connected; wpcomEmail.value = r.data.email || ''; } }
            catch (e) { wpcomConnected.value = false; }
        }
        async function wpcomBindDomainFn() {
            if (!wpcomDomain.value.trim()) { showToast('请输入或选择域名', 'error'); return; }
            wpcomBinding.value = true;
            try {
                const resp = await API.wpcomBindDomain({ domain: wpcomDomain.value.trim() });
                if (resp.code === 200) { wpcomResult.value = resp; showToast(resp.message || '域名已提交绑定'); }
                else { showToast(resp.message || '域名绑定失败', 'error'); }
            } catch (e) { showToast('域名绑定失败', 'error'); } finally { wpcomBinding.value = false; }
        }

        // ---- 4-Step Wizard ----
        function openWizard(mode = 'single') {
            wizardMode.value = mode; wizardStep.value = 1; wizardSiteId.value = null;
            createForm.site_name = ''; createForm.url = ''; createForm.admin_name = globalConfig.default_admin_name || 'admin';
            createForm.admin_password = globalConfig.default_admin_password || ''; createForm.tag = ''; createForm.security_id = '';
            createForm.http_username = ''; createForm.http_password = ''; createForm.verify_certificate = true; createForm.ssl_version = 'auto';
            createForm.domains = ''; createForm.base_port = 8081;
            createProgress.show = false; createProgress.results = [];
            selectedThemeIds.value = []; selectedPluginIds.value = []; step2Results.value = [];
            cfDnsResult.value = null; cfSelectedAccountId.value = ''; cfSelectedZone.value = ''; cfDnsName.value = ''; cfDnsRecords.value = []; cfDnsPage.value = 1; cfDnsTotal.value = 0; cfSelectedDnsRecords.value = []; cfEditingRecord.value = null;
            wpcomDomain.value = ''; wpcomResult.value = null;
            checkWpcomStatus();
            loadCfAccounts(); loadCfZones();
            wizardOpen.value = true;
        }
        function closeWizard() { wizardOpen.value = false; loadSites(); loadPanelData(); }

        // Step 4: Create site(s)
        async function wizardCreateSite() {
            loading.value = true;
            try {
                const isBatch = wizardMode.value === 'batch';
                let domains = [];
                if (isBatch) {
                    domains = createForm.domains.split('\n').map(d => d.trim()).filter(d => d);
                    if (!domains.length) { showToast('请至少输入一个域名', 'error'); loading.value = false; return; }
                } else {
                    const domain = createForm.site_name.trim();
                    if (!domain) { showToast('请输入域名', 'error'); loading.value = false; return; }
                    domains = [domain];
                }
                createProgress.show = true;
                createProgress.results = [];
                createProgress.message = `正在通过1Panel部署 ${domains.length} 个WordPress站点...`;
                const resp = await API.batchCreateWordPress({
                    domains: domains, admin_name: createForm.admin_name, admin_password: createForm.admin_password,
                    tag: createForm.tag, security_id: createForm.security_id, http_username: createForm.http_username,
                    http_password: createForm.http_password, verify_certificate: createForm.verify_certificate,
                    ssl_version: createForm.ssl_version, base_port: createForm.base_port, db_service: createForm.db_service,
                    website_group_id: createForm.website_group_id || 1,
                    theme_ids: selectedThemeIds.value.length ? selectedThemeIds.value : undefined,
                    plugin_ids: selectedPluginIds.value.length ? selectedPluginIds.value : undefined,
                });
                if (resp.code !== 200) { createProgress.message = `创建失败: ${resp.message}`; showToast(`创建失败: ${resp.message}`, 'error'); loading.value = false; return; }
                const results = resp.data.results || [];
                if (isBatch) {
                    // Batch mode: show summary
                    const ok = results.filter(r => r.status !== 'error').length;
                    const err = results.filter(r => r.status === 'error').length;
                    createProgress.results = results;
                    createProgress.message = `批量创建完成: ${ok} 成功, ${err} 失败`;
                    showToast(`批量创建完成: ${ok}/${results.length} 成功`);
                    await loadSites();
                    loading.value = false;
                    return; // Batch done, wizard stays open for user to review
                } else {
                    // Single mode: poll WP install status
                    const result = results[0];
                    if (result && result.status === 'error') { createProgress.message = `创建失败: ${result.message}`; showToast(result.message, 'error'); loading.value = false; return; }
                    wizardSiteId.value = result.site_id;
                    if (result.site_id && result.wp_install_status === 'installing') { startWPPolling(result.site_id, domains[0]); createProgress.message = `WordPress正在安装中...`; }
                    for (let i = 0; i < 48; i++) { await new Promise(r => setTimeout(r, 5000)); const s = wpInstallStatuses[result.site_id]; if (s && (s.status === 'installed' || s.status === 'failed')) break; }
                    const fs = wpInstallStatuses[result.site_id];
                    if (fs && fs.status === 'installed') { createProgress.message = `✅ 站点 ${domains[0]} 部署完成！`; showToast(`站点 ${domains[0]} 部署完成！`); }
                    else if (fs && fs.status === 'failed') { createProgress.message = `⚠️ 站点已创建，但WordPress安装未完成: ${fs.message}`; }
                    else { createProgress.message = `⏳ 站点部署已提交，1Panel正在处理...`; }
                    await loadSites();
                    loading.value = false;
                }
            } catch (e) { createProgress.message = `创建失败: ${e.message}`; showToast(`错误: ${e.message}`, 'error'); } finally { loading.value = false; }
        }

        // ---- WP Polling ----
        function startWPPolling(siteId, domain) {
            if (wpPollingTimers[siteId]) return;
            wpInstallStatuses[siteId] = { status: 'installing', message: '1Panel正在创建数据库...', domain };
            const timer = setInterval(async () => {
                try {
                    const resp = await API.getWPInstallStatus(siteId);
                    if (resp.code === 200 && resp.data) { wpInstallStatuses[siteId] = { ...resp.data, domain }; if (resp.data.status === 'installed' || resp.data.status === 'failed') { stopWPPolling(siteId); await loadSites(); } }
                } catch (e) {}
            }, 5000);
            wpPollingTimers[siteId] = timer;
        }
        function stopWPPolling(siteId) { if (wpPollingTimers[siteId]) { clearInterval(wpPollingTimers[siteId]); delete wpPollingTimers[siteId]; } }

        // ---- Edit ----
        function openEditModal(site) {
            editingSiteId.value = site.id;
            Object.assign(editForm, { site_name: site.site_name, url: site.url, admin_name: site.admin_name, admin_password: site.admin_password, tag: site.tag, security_id: site.security_id, http_username: site.http_username, http_password: site.http_password, verify_certificate: !!site.verify_certificate, ssl_version: site.ssl_version || 'auto' });
            showEditModal.value = true;
        }
        async function submitEdit() {
            loading.value = true;
            try { await API.updateSite(editingSiteId.value, editForm); showEditModal.value = false; showToast('站点已更新'); await loadSites(); } catch (e) { showToast('更新失败', 'error'); } finally { loading.value = false; }
        }

        // ---- Delete ----
        function confirmDelete(site) {
            showModal('删除站点', `确定要删除 "${site.site_name}" 吗？${site.panel_website_id ? '同时从1Panel删除WordPress应用和网站。' : ''}此操作不可撤销。`,
                async () => {
                    loading.value = true;
                    try { if (site.panel_website_id && panelConnected.value) await API.panelDeleteWebsite(site.panel_website_id, true); await API.deleteSite(site.id); showToast('站点已删除'); await loadSites(); await loadPanelData(); } catch (e) { showToast('删除失败', 'error'); } finally { loading.value = false; }
                    modal.show = false;
                }
            );
        }

        // ---- Fix 1Panel Website ----
        async function fixSiteWebsite(site) {
            loading.value = true;
            try {
                const resp = await API.fixWebsite(site.id);
                if (resp.code === 200) {
                    showToast(resp.message || '1Panel网站已修复');
                    await loadSites();
                } else {
                    showToast(resp.message || '修复失败', 'error');
                }
            } catch (e) { showToast('修复失败', 'error'); } finally { loading.value = false; }
        }

        function exportCSV() { API.exportCSV(); showToast('CSV文件已导出'); }
        async function saveGlobalConfig() {
            loading.value = true;
            try { await API.saveConfig(globalConfig); showToast('配置已保存'); } catch (e) { showToast('保存配置失败', 'error'); } finally { loading.value = false; }
        }

        onMounted(async () => {
            if (API.token) { try { const resp = await API.checkAuth(); if (resp.code === 200) { isLoggedIn.value = true; currentUser.value = resp.data.username; await loadInitialData(); } } catch (e) { API.logout(); } }
        });

        return {
            isLoggedIn, currentUser, currentPage, loading, toast, modal,
            loginForm, loginError, sites, searchQuery, filteredSites,
            panelConnected, panelWebsites, panelInstalledApps, panelGroups,
            wizardStep, wizardOpen, wizardMode, wizardSiteId,
            createForm, createProgress, wpInstallStatuses,
            themes, selectedThemeIds, selectedPluginIds, step2Installing, step2Results,
            feedSiteId, feedProducts, showFeedProductModal, feedEditId, feedEditForm,
            cfConnected, cfToken, cfEmail, cfKey, cfAuthMode, cfZones, cfSelectedZone, cfDnsName, cfProxied, cfServerIp, cfCreating, cfDnsResult,
            cfAccounts, cfSelectedAccountId, cfDnsRecords, cfDnsLoading, cfDnsPage, cfDnsPerPage, cfDnsTotal, cfDnsTotalPages, cfSelectedDnsRecords, cfEditingRecord, cfEditForm,
            wpcomConnected, wpcomEmail, wpcomBinding, wpcomDomain, wpcomResult,
            showEditModal, editForm, editingSiteId, globalConfig,
            plugins, uploadProgress, formatSize,
            handleLogin, handleLogout, refreshSites, syncWithPanel,
            openWizard, closeWizard, wizardCreateSite,
            loadCfDnsRecords, cfGoToPage, cfToggleDnsSelect, cfStartEditRecord, cfCancelEdit, cfSaveEditRecord, cfDeleteDnsRecord,
            checkWpcomStatus, wpcomBindDomainFn,
            openEditModal, submitEdit, confirmDelete, fixSiteWebsite, saveGlobalConfig, exportCSV,
            loadPlugins, handlePluginUpload, handleDeletePlugin, handleTogglePlugin,
            loadThemes, handleThemeUpload, handleDeleteTheme,
            loadFeedProducts, openFeedProductModal, closeFeedProductModal, handleSaveFeedProduct,
            handleDeleteFeedProduct, handleImportSampleProducts, handleExportFeed,
            cfVerify, loadCfZones, cfCreateDns, loadCfAccounts, handleDeleteCfAccount, handleSetDefaultCfAccount,
            showToast, showModal,
        };
    },

    template: `
    <!-- Login -->
    <div v-if="!isLoggedIn" class="min-h-screen flex items-center justify-center login-bg">
        <div class="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md fade-in">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4"><i class="fab fa-wordpress text-white text-3xl"></i></div>
                <h1 class="text-2xl font-bold text-gray-800">WordPress 站点管理</h1><p class="text-gray-500 mt-2">登录以管理您的WordPress站点</p>
            </div>
            <form @submit.prevent="handleLogin">
                <div class="mb-4"><label class="block text-sm font-medium text-gray-700 mb-1">用户名</label><input v-model="loginForm.username" type="text" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-indigo-500" placeholder="请输入用户名"></div>
                <div class="mb-6"><label class="block text-sm font-medium text-gray-700 mb-1">密码</label><input v-model="loginForm.password" type="password" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-indigo-500" placeholder="请输入密码"></div>
                <p v-if="loginError" class="text-red-500 text-sm mb-4">{{ loginError }}</p>
                <button type="submit" :disabled="loading" class="w-full btn-primary text-white py-3 rounded-lg font-semibold hover:shadow-lg transition"><i v-if="loading" class="fas fa-spinner fa-spin mr-2"></i><span v-else>登 录</span></button>
            </form>
        </div>
    </div>

    <!-- Main App -->
    <div v-else class="min-h-screen flex">
        <!-- Sidebar -->
        <aside class="w-64 sidebar-gradient text-white flex flex-col">
            <div class="p-6 border-b border-indigo-700"><div class="flex items-center gap-3"><div class="w-10 h-10 bg-white bg-opacity-20 rounded-lg flex items-center justify-center"><i class="fab fa-wordpress text-xl"></i></div><div><h2 class="font-bold text-lg">WP 管理器</h2><p class="text-xs text-indigo-300">站点管理平台</p></div></div></div>
            <nav class="flex-1 p-4 space-y-1">
                <a @click="currentPage = 'dashboard'" :class="['flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition', currentPage === 'dashboard' ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-10']"><i class="fas fa-tachometer-alt w-5 text-center"></i><span>仪表盘</span></a>
                <a @click="currentPage = 'sites'" :class="['flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition', currentPage === 'sites' ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-10']"><i class="fas fa-globe w-5 text-center"></i><span>站点列表</span><span class="ml-auto bg-indigo-500 text-xs px-2 py-0.5 rounded-full">{{ sites.length }}</span></a>
                <a @click="openWizard('single')" class="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition hover:bg-white hover:bg-opacity-10"><i class="fas fa-plus-circle w-5 text-center"></i><span>创建站点</span></a>
                <a @click="currentPage = 'plugins'" :class="['flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition', currentPage === 'plugins' ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-10']"><i class="fas fa-plug w-5 text-center"></i><span>插件管理</span><span class="ml-auto bg-indigo-500 text-xs px-2 py-0.5 rounded-full">{{ plugins.length }}</span></a>
                <a @click="currentPage = 'themes'" :class="['flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition', currentPage === 'themes' ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-10']"><i class="fas fa-palette w-5 text-center"></i><span>主题管理</span><span class="ml-auto bg-indigo-500 text-xs px-2 py-0.5 rounded-full">{{ themes.length }}</span></a>
                <a @click="currentPage = 'feed'" :class="['flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition', currentPage === 'feed' ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-10']"><i class="fas fa-tags w-5 text-center"></i><span>商品Feed</span><span class="ml-auto bg-indigo-500 text-xs px-2 py-0.5 rounded-full">{{ feedProducts.length }}</span></a>
                <a @click="currentPage = 'settings'" :class="['flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition', currentPage === 'settings' ? 'bg-white bg-opacity-20' : 'hover:bg-white hover:bg-opacity-10']"><i class="fas fa-cog w-5 text-center"></i><span>系统设置</span></a>
            </nav>
            <div class="p-4 border-t border-indigo-700"><div class="flex items-center gap-3 px-2"><div class="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center"><i class="fas fa-user text-sm"></i></div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">{{ currentUser }}</p><p class="text-xs text-indigo-300">管理员</p></div><button @click="handleLogout" class="text-indigo-300 hover:text-white" title="退出登录"><i class="fas fa-sign-out-alt"></i></button></div></div>
        </aside>

        <!-- Main Content -->
        <main class="flex-1 overflow-auto">
            <header class="bg-white border-b px-8 py-4 flex items-center justify-between">
                <div><h1 class="text-xl font-bold text-gray-800">{{ currentPage === 'dashboard' ? '仪表盘' : currentPage === 'sites' ? '站点列表' : currentPage === 'plugins' ? '插件管理' : currentPage === 'themes' ? '主题管理' : currentPage === 'feed' ? '商品Feed (GMC)' : '系统设置' }}</h1><p class="text-sm text-gray-500"><span :class="panelConnected ? 'text-green-500' : 'text-red-500'"><i class="fas fa-circle text-xs mr-1"></i>{{ panelConnected ? '1Panel 已连接' : '1Panel 未连接' }}</span></p></div>
                <button @click="syncWithPanel" class="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition text-sm" title="从1Panel同步数据"><i class="fas fa-exchange-alt mr-2"></i>同步1Panel</button>
                <button @click="refreshSites" class="px-4 py-2 border rounded-lg hover:bg-gray-50 transition text-sm"><i class="fas fa-sync-alt mr-2" :class="{'fa-spin': loading}"></i>刷新</button>
            </header>

            <!-- Dashboard -->
            <div v-if="currentPage === 'dashboard'" class="p-8 fade-in">
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <div class="bg-white rounded-xl p-6 card-shadow"><div class="flex items-center justify-between"><div><p class="text-sm text-gray-500">站点总数</p><p class="text-3xl font-bold text-gray-800 mt-1">{{ sites.length }}</p></div><div class="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center"><i class="fas fa-globe text-indigo-600 text-xl"></i></div></div></div>
                    <div class="bg-white rounded-xl p-6 card-shadow"><div class="flex items-center justify-between"><div><p class="text-sm text-gray-500">1Panel连接</p><p class="text-3xl font-bold mt-1" :class="panelConnected ? 'text-green-600' : 'text-red-600'">{{ panelConnected ? '正常' : '断开' }}</p></div><div class="w-12 h-12 rounded-lg flex items-center justify-center" :class="panelConnected ? 'bg-green-100' : 'bg-red-100'"><i class="fas fa-server text-xl" :class="panelConnected ? 'text-green-600' : 'text-red-600'"></i></div></div></div>
                    <div class="bg-white rounded-xl p-6 card-shadow"><div class="flex items-center justify-between"><div><p class="text-sm text-gray-500">已装插件</p><p class="text-3xl font-bold text-gray-800 mt-1">{{ plugins.length }}</p></div><div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center"><i class="fas fa-plug text-purple-600 text-xl"></i></div></div></div>
                    <div class="bg-white rounded-xl p-6 card-shadow"><div class="flex items-center justify-between"><div><p class="text-sm text-gray-500">已装主题</p><p class="text-3xl font-bold text-gray-800 mt-1">{{ themes.length }}</p></div><div class="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center"><i class="fas fa-palette text-orange-600 text-xl"></i></div></div></div>
                </div>
                <div class="bg-white rounded-xl card-shadow p-6">
                    <h3 class="font-semibold text-gray-800 mb-4"><i class="fas fa-bolt mr-2 text-indigo-500"></i>快速操作</h3>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <button @click="openWizard('single')" class="p-4 border-2 border-dashed border-indigo-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition text-center"><i class="fas fa-plus-circle text-2xl text-indigo-500 mb-2"></i><p class="text-sm font-medium text-gray-700">创建单个站点</p></button>
                        <button @click="openWizard('batch')" class="p-4 border-2 border-dashed border-purple-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition text-center"><i class="fas fa-layer-group text-2xl text-purple-500 mb-2"></i><p class="text-sm font-medium text-gray-700">批量创建站点</p></button>
                        <button @click="currentPage = 'plugins'" class="p-4 border-2 border-dashed border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-center"><i class="fas fa-plug text-2xl text-blue-500 mb-2"></i><p class="text-sm font-medium text-gray-700">管理插件</p></button>
                        <button @click="exportCSV" class="p-4 border-2 border-dashed border-green-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition text-center"><i class="fas fa-file-csv text-2xl text-green-500 mb-2"></i><p class="text-sm font-medium text-gray-700">导出CSV</p></button>
                    </div>
                </div>
            </div>

            <!-- Sites List -->
            <div v-if="currentPage === 'sites'" class="p-8 fade-in">
                <div class="flex items-center justify-between mb-6">
                    <div class="relative"><i class="fas fa-search absolute left-3 top-3 text-gray-400"></i><input v-model="searchQuery" type="text" placeholder="搜索站点..." class="pl-10 pr-4 py-2 border rounded-lg focus:border-indigo-500 w-64"></div>
                    <div class="flex gap-3"><button @click="exportCSV" class="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm"><i class="fas fa-download mr-2"></i>导出CSV</button></div>
                </div>
                <div class="bg-white rounded-xl card-shadow overflow-hidden">
                    <div v-if="!filteredSites.length" class="p-12 text-center text-gray-400"><i class="fas fa-inbox text-4xl mb-4"></i><p>暂无站点，点击"创建站点"开始</p></div>
                    <div v-else class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50"><tr><th class="px-6 py-3 text-left font-medium text-gray-600">站点</th><th class="px-6 py-3 text-left font-medium text-gray-600">URL</th><th class="px-6 py-3 text-left font-medium text-gray-600">标签</th><th class="px-6 py-3 text-left font-medium text-gray-600">端口</th><th class="px-6 py-3 text-left font-medium text-gray-600">1Panel</th><th class="px-6 py-3 text-left font-medium text-gray-600">DNS</th><th class="px-6 py-3 text-right font-medium text-gray-600">操作</th></tr></thead>
                            <tbody class="divide-y">
                                <tr v-for="site in filteredSites" :key="site.id" class="hover:bg-gray-50">
                                    <td class="px-6 py-4"><div class="font-medium text-gray-800">{{ site.site_name }}</div><div class="text-xs text-gray-500">{{ site.admin_name || '-' }}</div></td>
                                    <td class="px-6 py-4"><a :href="site.url" target="_blank" class="text-indigo-600 hover:text-indigo-800">{{ site.url }}</a></td>
                                    <td class="px-6 py-4"><span v-if="site.tag" class="bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full">{{ site.tag }}</span><span v-else class="text-gray-400">-</span></td>
                                    <td class="px-6 py-4 text-gray-600">{{ site.port || '-' }}</td>
                                    <td class="px-6 py-4"><span v-if="site.panel_website_id" :class="[site.panel_status === 'Running' ? 'bg-green-100 text-green-700' : site.panel_status === 'deleted' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700']" class="text-xs px-2 py-1 rounded-full"><i :class="[site.panel_status === 'Running' ? 'fas fa-check-circle' : site.panel_status === 'deleted' ? 'fas fa-times-circle' : 'fas fa-exclamation-circle']" class="mr-1"></i>{{ site.panel_status === 'Running' ? '正常' : site.panel_status === 'deleted' ? '已删除' : site.panel_status || '未知' }}</span><span v-else class="text-gray-400 text-xs">未关联</span></td>
                                    <td class="px-6 py-4"><span v-if="site.cf_dns_record_id" class="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-full"><i class="fab fa-cloudflare mr-1"></i>CF</span><span v-else class="text-gray-400">-</span></td>
                                    <td class="px-6 py-4 text-right"><div class="flex items-center justify-end gap-2"><button @click="openEditModal(site)" class="text-indigo-500 hover:text-indigo-700" title="编辑"><i class="fas fa-edit"></i></button><button v-if="site.panel_app_install_id && (!site.panel_website_id || site.panel_status === 'deleted')" @click="fixSiteWebsite(site)" class="text-orange-500 hover:text-orange-700" title="修复1Panel网站"><i class="fas fa-wrench"></i></button><button @click="confirmDelete(site)" class="text-red-400 hover:text-red-600" title="删除"><i class="fas fa-trash"></i></button></div></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Plugins -->
            <div v-if="currentPage === 'plugins'" class="p-8 fade-in">
                <div class="bg-white rounded-xl card-shadow overflow-hidden">
                    <div class="p-6 border-b flex items-center justify-between">
                        <h3 class="font-semibold text-gray-800"><i class="fas fa-plug mr-2 text-indigo-500"></i>插件库</h3>
                        <label class="btn-primary text-white px-4 py-2 rounded-lg cursor-pointer text-sm"><i class="fas fa-upload mr-2"></i>上传插件<input type="file" accept=".zip" @change="handlePluginUpload" class="hidden"></label>
                    </div>
                    <div v-if="!plugins.length" class="p-12 text-center text-gray-400"><i class="fas fa-puzzle-piece text-4xl mb-4"></i><p>暂无插件，请上传WordPress插件的.zip文件</p></div>
                    <div v-else class="divide-y">
                        <div v-for="p in plugins" :key="p.id" class="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center" :class="p.enabled ? 'bg-indigo-100' : 'bg-gray-100'"><i class="fas fa-puzzle-piece" :class="p.enabled ? 'text-indigo-600' : 'text-gray-400'"></i></div>
                            <div class="flex-1 min-w-0"><p class="font-medium text-sm">{{ p.name }}</p><p class="text-xs text-gray-500">{{ p.filename }} · {{ formatSize(p.file_size) }}</p></div>
                            <div class="flex items-center gap-3"><button @click="handleTogglePlugin(p)" :class="p.enabled ? 'text-green-600 hover:text-green-800' : 'text-gray-400 hover:text-gray-600'" :title="p.enabled ? '点击禁用' : '点击启用'"><i :class="p.enabled ? 'fas fa-toggle-on text-xl' : 'fas fa-toggle-off text-xl'"></i></button><button @click="handleDeletePlugin(p)" class="text-red-400 hover:text-red-600" title="删除"><i class="fas fa-trash"></i></button></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Themes -->
            <div v-if="currentPage === 'themes'" class="p-8 fade-in">
                <div class="bg-white rounded-xl card-shadow overflow-hidden">
                    <div class="p-6 border-b flex items-center justify-between">
                        <h3 class="font-semibold text-gray-800"><i class="fas fa-palette mr-2 text-orange-500"></i>主题库</h3>
                        <label class="btn-accent text-white px-4 py-2 rounded-lg cursor-pointer text-sm transition"><i class="fas fa-upload mr-2"></i>上传主题<input type="file" accept=".zip" @change="handleThemeUpload" class="hidden"></label>
                    </div>
                    <div v-if="!themes.length" class="p-12 text-center text-gray-400"><i class="fas fa-palette text-4xl mb-4"></i><p>暂无主题，请上传WordPress主题的.zip文件</p></div>
                    <div v-else class="divide-y">
                        <div v-for="t in themes" :key="t.id" class="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition">
                            <div class="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-100"><i class="fas fa-palette text-orange-600"></i></div>
                            <div class="flex-1 min-w-0"><p class="font-medium text-sm">{{ t.name }}</p><p class="text-xs text-gray-500">{{ t.filename }} · {{ formatSize(t.file_size) }}</p></div>
                            <button @click="handleDeleteTheme(t)" class="text-red-400 hover:text-red-600" title="删除"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Feed Products (GMC) -->
            <div v-if="currentPage === 'feed'" class="p-8 fade-in">
                <div class="bg-white rounded-xl card-shadow overflow-hidden">
                    <div class="p-6 border-b">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="font-semibold text-gray-800"><i class="fas fa-tags mr-2 text-green-500"></i>商品 Feed 管理</h3>
                            <div class="flex items-center gap-3">
                                <select v-model="feedSiteId" @change="loadFeedProducts" class="px-4 py-2 border rounded-lg text-sm focus:border-green-500">
                                    <option value="">-- 选择站点 --</option>
                                    <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.site_name }}</option>
                                </select>
                                <button v-if="feedSiteId" @click="handleImportSampleProducts" class="px-3 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 transition"><i class="fas fa-download mr-1"></i>导入示例</button>
                                <button v-if="feedSiteId" @click="openFeedProductModal(null)" class="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 transition"><i class="fas fa-plus mr-1"></i>添加商品</button>
                                <button v-if="feedSiteId" @click="handleExportFeed" class="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition"><i class="fas fa-file-export mr-1"></i>导出XML</button>
                            </div>
                        </div>
                        <p class="text-xs text-gray-500">每个站点独立管理商品 Feed，用于 Google Merchant Center 提交。选择站点后可添加、编辑、导入示例和导出 XML。</p>
                    </div>
                    <div v-if="!feedSiteId" class="p-12 text-center text-gray-400">
                        <i class="fas fa-tags text-4xl mb-4"></i>
                        <p>请先选择一个站点查看其商品 Feed</p>
                    </div>
                    <div v-else-if="!feedProducts.length" class="p-12 text-center text-gray-400">
                        <i class="fas fa-box-open text-4xl mb-4"></i>
                        <p>该站点暂无商品，点击「添加商品」或「导入示例」开始</p>
                    </div>
                    <div v-else class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                                <tr>
                                    <th class="px-4 py-3">商品信息</th>
                                    <th class="px-4 py-3">价格</th>
                                    <th class="px-4 py-3">库存</th>
                                    <th class="px-4 py-3">品牌 / GTIN</th>
                                    <th class="px-4 py-3">分类</th>
                                    <th class="px-4 py-3 text-right">操作</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y">
                                <tr v-for="p in feedProducts" :key="p.id" class="hover:bg-gray-50 transition">
                                    <td class="px-4 py-3">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded bg-gray-100 flex items-center justify-center overflow-hidden">
                                                <img v-if="p.image_url" :src="p.image_url" class="w-full h-full object-cover" onerror="this.style.display='none'">
                                                <i v-else class="fas fa-image text-gray-400"></i>
                                            </div>
                                            <div>
                                                <p class="font-medium text-gray-800 truncate max-w-xs">{{ p.title }}</p>
                                                <p class="text-xs text-gray-500">{{ p.mpn }}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="px-4 py-3 font-medium">{{ p.price }}</td>
                                    <td class="px-4 py-3">
                                        <span :class="p.availability === 'in_stock' ? 'text-green-600' : p.availability === 'out_of_stock' ? 'text-red-600' : 'text-yellow-600'">
                                            {{ p.availability === 'in_stock' ? '有货' : p.availability === 'out_of_stock' ? '缺货' : '预定' }}
                                        </span>
                                    </td>
                                    <td class="px-4 py-3 text-xs text-gray-600">{{ p.brand }}<br>{{ p.gtin }}</td>
                                    <td class="px-4 py-3 text-xs text-gray-600 max-w-xs truncate">{{ p.google_product_category }}</td>
                                    <td class="px-4 py-3 text-right">
                                        <button @click="openFeedProductModal(p)" class="text-blue-500 hover:text-blue-700 mr-2" title="编辑"><i class="fas fa-edit"></i></button>
                                        <button @click="handleDeleteFeedProduct(p)" class="text-red-400 hover:text-red-600" title="删除"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Settings -->
            <div v-if="currentPage === 'settings'" class="p-8 fade-in">
                <div class="max-w-3xl mx-auto space-y-6">
                    <div class="bg-white rounded-xl card-shadow p-6">
                        <h3 class="font-semibold text-gray-800 mb-4"><i class="fas fa-sliders-h mr-2 text-indigo-500"></i>默认WordPress配置</h3>
                        <div class="space-y-4">
                            <div><label class="block text-sm font-medium text-gray-700 mb-1">默认管理员用户名</label><input v-model="globalConfig.default_admin_name" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div>
                            <div><label class="block text-sm font-medium text-gray-700 mb-1">默认管理员密码</label><input v-model="globalConfig.default_admin_password" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"><p class="text-xs text-gray-500 mt-1">应用于所有新创建的WordPress站点</p></div>
                            <div><label class="block text-sm font-medium text-gray-700 mb-1">默认数据库服务</label><select v-model="globalConfig.db_service" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"><option value="mariadb">MariaDB</option><option value="mysql">MySQL</option></select></div>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl card-shadow p-6">
                        <h3 class="font-semibold text-gray-800 mb-4"><i class="fab fa-cloudflare mr-2 text-orange-500"></i>Cloudflare 配置</h3>
                        <div class="space-y-4">
                            <!-- Saved accounts list -->
                            <div v-if="cfAccounts.length" class="bg-gray-50 rounded-lg p-3">
                                <h4 class="text-sm font-semibold text-gray-700 mb-2">已保存的账号</h4>
                                <div v-for="acc in cfAccounts" :key="acc.id" class="flex items-center justify-between py-2 border-b border-gray-200 last:border-b-0">
                                    <div class="flex items-center gap-2">
                                        <i class="fas fa-cloud text-orange-500"></i>
                                        <span class="text-sm font-medium">{{ acc.name }}</span>
                                        <span v-if="acc.is_default" class="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">默认</span>
                                        <span class="text-xs text-gray-400 pl-2">{{ acc.auth_type === 'global' ? acc.api_email : 'API Token' }}</span>
                                    </div>
                                    <div class="flex gap-1">
                                        <button v-if="!acc.is_default" @click="handleSetDefaultCfAccount(acc.id)" class="text-xs text-gray-400 hover:text-orange-500 px-2 py-1" title="设为默认"><i class="fas fa-star"></i></button>
                                        <button @click="handleDeleteCfAccount(acc.id)" class="text-xs text-gray-400 hover:text-red-500 px-2 py-1" title="删除"><i class="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                            <div class="flex items-center gap-3 mb-2"><span :class="cfConnected ? 'text-green-500' : 'text-red-500'"><i class="fas fa-circle text-xs mr-1"></i>{{ cfConnected ? '已连接' : '未连接' }}</span></div>
                            <div class="flex gap-2 mb-3">
                                <button @click="cfAuthMode='token'" :class="cfAuthMode==='token' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'" class="px-3 py-1.5 rounded-lg text-sm font-medium">API Token</button>
                                <button @click="cfAuthMode='global'" :class="cfAuthMode==='global' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Global API Key</button>
                            </div>
                            <div v-if="cfAuthMode==='token'">
                                <label class="block text-sm font-medium text-gray-700 mb-1">API Token</label>
                                <div class="flex gap-2"><input v-model="cfToken" type="password" placeholder="输入Cloudflare API Token" class="flex-1 px-4 py-2 border rounded-lg focus:border-indigo-500"><button @click="cfVerify" :disabled="loading" class="btn-primary text-white px-4 py-2 rounded-lg"><i class="fas fa-check mr-2"></i>验证并保存</button></div>
                                <p class="text-xs text-gray-500 mt-1">Cloudflare控制台 → My Profile → API Tokens → 创建Token（需Zone:DNS:Edit权限）</p>
                            </div>
                            <div v-if="cfAuthMode==='global'">
                                <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
                                <input v-model="cfEmail" type="email" placeholder="Cloudflare账户邮箱" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500 mb-2">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Global API Key</label>
                                <div class="flex gap-2"><input v-model="cfKey" type="password" placeholder="输入Global API Key" class="flex-1 px-4 py-2 border rounded-lg focus:border-indigo-500"><button @click="cfVerify" :disabled="loading" class="btn-primary text-white px-4 py-2 rounded-lg"><i class="fas fa-check mr-2"></i>验证并保存</button></div>
                                <p class="text-xs text-gray-500 mt-1">Cloudflare控制台 → My Profile → API Tokens → Global API Key</p>
                            </div>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl card-shadow p-6">
                        <h3 class="font-semibold text-gray-800 mb-4"><i class="fab fa-wordpress mr-2 text-blue-500"></i>WordPress.com 连接</h3>
                        <div class="space-y-4">
                            <div class="flex items-center gap-3"><span :class="wpcomConnected ? 'text-green-500' : 'text-red-500'"><i class="fas fa-circle text-xs mr-1"></i>{{ wpcomConnected ? '已连接' : '未连接' }}</span><span v-if="wpcomConnected" class="text-sm text-gray-600">{{ wpcomEmail }}</span></div>
                            <div v-if="!wpcomConnected" class="space-y-3">
                                <p class="text-sm text-gray-600">连接 WordPress.com 后可在创建向导中绑定自定义域名。通过 OAuth2 授权，凭据全局保存，批量创建无需重复认证。</p>
                                <button @click="async () => { const r = await API.wpcomAuthUrl(); if (r.code === 200 && r.data.url) { window.open(r.data.url, '_blank'); } else { showToast(r.message || '获取授权URL失败', 'error'); } }" class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600"><i class="fas fa-link mr-2"></i>连接 WordPress.com</button>
                                <p class="text-xs text-gray-500">点击后将跳转到 WordPress.com 授权页面</p>
                                <div class="bg-gray-50 rounded-lg p-3 mt-2"><p class="text-xs text-gray-600 mb-2">或手动输入 OAuth Code</p><div class="flex gap-2"><input id="wpcom-code-input" type="text" placeholder="粘贴授权码..." class="flex-1 px-3 py-2 border rounded-lg text-sm"><button @click="async () => { const code = document.getElementById('wpcom-code-input').value; if (!code.trim()) { showToast('请输入授权码', 'error'); return; } const r = await API.request('POST', '/api/wordpress-com/callback', { code: code.trim() }); if (r.code === 200) { wpcomConnected = true; wpcomEmail = r.data.email || ''; showToast('WordPress.com 连接成功'); } else { showToast(r.message || '连接失败', 'error'); } }" class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600">提交</button></div></div>
                            </div>
                            <div v-else class="space-y-2">
                                <p class="text-sm text-green-700"><i class="fas fa-check-circle mr-1"></i>已成功连接到 WordPress.com</p>
                                <button @click="checkWpcomStatus" class="text-sm text-blue-500 hover:text-blue-700"><i class="fas fa-sync-alt mr-1"></i>刷新状态</button>
                            </div>
                        </div>
                    </div>
                    <button @click="saveGlobalConfig" :disabled="loading" class="w-full btn-primary text-white py-3 rounded-lg font-semibold"><i class="fas fa-save mr-2"></i>保存设置</button>
                </div>
            </div>
        </main>

        <!-- 4-Step Wizard Modal -->
        <div v-if="wizardOpen" class="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto fade-in">
                <div class="p-6 border-b">
                    <div class="flex items-center justify-between mb-4"><h2 class="text-lg font-bold">创建WordPress站点</h2><button @click="closeWizard" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button></div>
                    <div class="flex items-center">
                        <div class="flex items-center" :class="wizardStep >= 1 ? 'text-indigo-600' : 'text-gray-400'"><div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" :class="wizardStep >= 1 ? 'bg-indigo-600 text-white' : 'bg-gray-200'">1</div><span class="ml-2 text-sm font-medium">主题 & 插件</span></div>
                        <div class="flex-1 h-0.5 mx-1" :class="wizardStep >= 2 ? 'bg-indigo-600' : 'bg-gray-200'"></div>
                        <div class="flex items-center" :class="wizardStep >= 2 ? 'text-indigo-600' : 'text-gray-400'"><div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" :class="wizardStep >= 2 ? 'bg-indigo-600 text-white' : 'bg-gray-200'">2</div><span class="ml-2 text-sm font-medium">DNS解析</span></div>
                        <div class="flex-1 h-0.5 mx-1" :class="wizardStep >= 3 ? 'bg-indigo-600' : 'bg-gray-200'"></div>
                        <div class="flex items-center" :class="wizardStep >= 3 ? 'text-indigo-600' : 'text-gray-400'"><div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" :class="wizardStep >= 3 ? 'bg-indigo-600 text-white' : 'bg-gray-200'">3</div><span class="ml-2 text-sm font-medium">WordPress.com</span></div>
                        <div class="flex-1 h-0.5 mx-1" :class="wizardStep >= 4 ? 'bg-indigo-600' : 'bg-gray-200'"></div>
                        <div class="flex items-center" :class="wizardStep >= 4 ? 'text-indigo-600' : 'text-gray-400'"><div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" :class="wizardStep >= 4 ? 'bg-indigo-600 text-white' : 'bg-gray-200'">4</div><span class="ml-2 text-sm font-medium">创建站点</span></div>
                    </div>
                </div>

                <!-- Step 1: Choose Themes & Plugins -->
                <div v-if="wizardStep === 1" class="p-6 space-y-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2"><p class="text-blue-700 text-sm"><i class="fas fa-info-circle mr-2"></i>选择要安装的主题和插件，将在站点创建后自动安装。</p></div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-3"><h4 class="text-sm font-semibold text-gray-700"><i class="fas fa-palette mr-2 text-orange-500"></i>选择主题</h4><label class="btn-accent text-white text-xs px-3 py-1 rounded-lg cursor-pointer transition"><i class="fas fa-upload mr-1"></i>上传主题<input type="file" accept=".zip" @change="handleThemeUpload" class="hidden"></label></div>
                        <div v-if="!themes.length" class="text-sm text-gray-400 py-2">暂无主题，请先上传 .zip 格式的WordPress主题</div>
                        <div v-else class="space-y-2">
                            <div v-for="t in themes" :key="t.id" @click="selectedThemeIds = selectedThemeIds.includes(t.id) ? selectedThemeIds.filter(id => id !== t.id) : [...selectedThemeIds, t.id]" :class="['flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition border', selectedThemeIds.includes(t.id) ? 'bg-orange-50 border-orange-300' : 'bg-white border-gray-200 hover:border-orange-200']"><i :class="[selectedThemeIds.includes(t.id) ? 'fas fa-check-square text-orange-600' : 'far fa-square text-gray-400']" class="text-lg"></i><div class="flex-1"><p class="text-sm font-medium">{{ t.name }}</p><p class="text-xs text-gray-500">{{ t.filename }} · {{ formatSize(t.file_size) }}</p></div></div>
                        </div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="flex items-center justify-between mb-3"><h4 class="text-sm font-semibold text-gray-700"><i class="fas fa-plug mr-2 text-indigo-500"></i>选择插件</h4><label class="text-xs btn-primary text-white px-3 py-1 rounded-lg cursor-pointer"><i class="fas fa-upload mr-1"></i>上传插件<input type="file" accept=".zip" @change="handlePluginUpload" class="hidden"></label></div>
                        <div v-if="!plugins.filter(p => p.enabled).length" class="text-sm text-gray-400 py-2">暂无可用插件，请先上传 .zip 格式的WordPress插件</div>
                        <div v-else class="space-y-2">
                            <div v-for="p in plugins.filter(p => p.enabled)" :key="p.id" @click="selectedPluginIds = selectedPluginIds.includes(p.id) ? selectedPluginIds.filter(id => id !== p.id) : [...selectedPluginIds, p.id]" :class="['flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition border', selectedPluginIds.includes(p.id) ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-gray-200 hover:border-indigo-200']"><i :class="[selectedPluginIds.includes(p.id) ? 'fas fa-check-square text-indigo-600' : 'far fa-square text-gray-400']" class="text-lg"></i><div class="flex-1"><p class="text-sm font-medium">{{ p.name }}</p><p class="text-xs text-gray-500">{{ p.filename }} · {{ formatSize(p.file_size) }}</p></div></div>
                        </div>
                    </div>
                </div>

                <!-- Step 2: Cloudflare DNS Management -->
                <div v-if="wizardStep === 2" class="p-6 space-y-4">
                    <div v-if="!cfConnected" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-2">
                        <p class="text-yellow-700 text-sm mb-3"><i class="fas fa-exclamation-triangle mr-2"></i>Cloudflare未授权。授权后可查看和配置DNS解析。</p>
                        <div class="flex gap-2 mb-2">
                            <button @click="cfAuthMode='token'" :class="cfAuthMode==='token' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'" class="px-3 py-1.5 rounded-lg text-sm font-medium">API Token</button>
                            <button @click="cfAuthMode='global'" :class="cfAuthMode==='global' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'" class="px-3 py-1.5 rounded-lg text-sm font-medium">Global API Key</button>
                        </div>
                        <div v-if="cfAuthMode==='token'" class="flex gap-2"><input v-model="cfToken" type="password" placeholder="输入Cloudflare API Token" class="flex-1 px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"><button @click="cfVerify" :disabled="loading" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fas fa-check mr-1"></i>验证</button></div>
                        <div v-if="cfAuthMode==='global'" class="space-y-2">
                            <input v-model="cfEmail" type="email" placeholder="Cloudflare账户邮箱" class="w-full px-3 py-2 border rounded-lg text-sm focus:border-indigo-500">
                            <div class="flex gap-2"><input v-model="cfKey" type="password" placeholder="输入Global API Key" class="flex-1 px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"><button @click="cfVerify" :disabled="loading" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i class="fas fa-check mr-1"></i>验证</button></div>
                        </div>
                        <p class="text-xs text-gray-500 mt-2">Cloudflare控制台 → My Profile → API Tokens</p>
                    </div>
                    <div v-else class="space-y-4">
                        <div class="bg-green-50 border border-green-200 rounded-lg p-4"><p class="text-green-700 text-sm"><i class="fab fa-cloudflare mr-2"></i>Cloudflare已连接</p></div>
                        <div v-if="cfAccounts.length > 1"><label class="block text-sm font-medium text-gray-700 mb-1">选择Cloudflare账号</label><select v-model="cfSelectedAccountId" @change="loadCfZones" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"><option value="">默认账号</option><option v-for="acc in cfAccounts" :key="acc.id" :value="acc.id">{{ acc.name }} <span class="text-xs text-gray-400">({{ acc.auth_type === 'global' ? acc.api_email : 'API Token' }})</span></option></select></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">选择域名区域</label><select v-model="cfSelectedZone" @change="loadCfDnsRecords" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"><option value="">-- 选择 Zone --</option><option v-for="z in cfZones" :key="z.id" :value="z.id">{{ z.name }}</option></select></div>
                        <!-- DNS Records List -->
                        <div v-if="cfSelectedZone" class="bg-gray-50 rounded-lg p-4">
                            <div class="flex items-center justify-between mb-3">
                                <h4 class="text-sm font-semibold text-gray-700"><i class="fas fa-list mr-2 text-orange-500"></i>DNS 记录</h4>
                                <button @click="loadCfDnsRecords" :disabled="cfDnsLoading" class="text-xs px-3 py-1 bg-orange-500 text-white rounded-lg hover:bg-orange-600"><i :class="cfDnsLoading ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'"></i><span class="ml-1">刷新</span></button>
                            </div>
                            <div v-if="cfDnsLoading" class="text-center text-gray-400 py-4"><i class="fas fa-spinner fa-spin mr-2"></i>加载中...</div>
                            <div v-else-if="!cfDnsRecords.length" class="text-center text-gray-400 py-4">暂无DNS记录</div>
                            <div v-else class="space-y-1">
                                <div v-for="r in cfDnsRecords" :key="r.id" class="flex items-center justify-between px-3 py-2 bg-white rounded-lg border text-sm" :class="cfSelectedDnsRecords.some(s => s.id === r.id) ? 'border-orange-300 bg-orange-50' : 'border-gray-200'">
                                    <div class="flex items-center gap-3">
                                        <input type="checkbox" :checked="cfSelectedDnsRecords.some(s => s.id === r.id)" @change="cfToggleDnsSelect(r)" class="w-4 h-4 text-orange-500 rounded cursor-pointer">
                                        <span class="w-10 text-xs font-mono font-bold text-gray-500">{{ r.type }}</span>
                                        <span class="font-medium text-gray-700">{{ r.name }}</span>
                                        <span class="text-gray-500 font-mono text-xs">{{ r.content }}</span>
                                        <span v-if="r.proxied" class="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">已代理</span>
                                        <span class="text-xs text-gray-400">TTL: {{ r.ttl === 1 ? 'Auto' : r.ttl }}</span>
                                    </div>
                                    <div class="flex gap-1">
                                        <button @click="cfStartEditRecord(r)" class="text-blue-500 hover:text-blue-700 text-xs px-2 py-1" title="编辑"><i class="fas fa-edit"></i></button>
                                        <button @click="cfDeleteDnsRecord(r)" class="text-red-400 hover:text-red-600 text-xs px-2 py-1" title="删除"><i class="fas fa-trash"></i></button>
                                    </div>
                                </div>
                            </div>
                            <!-- Pagination -->
                            <div v-if="cfDnsTotalPages > 1" class="flex items-center justify-between pt-2">
                                <span class="text-xs text-gray-500">共 {{ cfDnsTotal }} 条, {{ cfSelectedDnsRecords.length }} 条已选</span>
                                <div class="flex items-center gap-1">
                                    <button @click="cfGoToPage(1)" :disabled="cfDnsPage <= 1" class="px-2 py-1 text-xs rounded border hover:bg-gray-100" :class="cfDnsPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600'"><i class="fas fa-angle-double-left"></i></button>
                                    <button @click="cfGoToPage(cfDnsPage - 1)" :disabled="cfDnsPage <= 1" class="px-2 py-1 text-xs rounded border hover:bg-gray-100" :class="cfDnsPage <= 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600'"><i class="fas fa-angle-left"></i></button>
                                    <span class="px-2 text-xs text-gray-600">{{ cfDnsPage }} / {{ cfDnsTotalPages }}</span>
                                    <button @click="cfGoToPage(cfDnsPage + 1)" :disabled="cfDnsPage >= cfDnsTotalPages" class="px-2 py-1 text-xs rounded border hover:bg-gray-100" :class="cfDnsPage >= cfDnsTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600'"><i class="fas fa-angle-right"></i></button>
                                    <button @click="cfGoToPage(cfDnsTotalPages)" :disabled="cfDnsPage >= cfDnsTotalPages" class="px-2 py-1 text-xs rounded border hover:bg-gray-100" :class="cfDnsPage >= cfDnsTotalPages ? 'text-gray-300 cursor-not-allowed' : 'text-gray-600'"><i class="fas fa-angle-double-right"></i></button>
                                </div>
                            </div>
                            <div v-else class="text-xs text-gray-400 pt-1">{{ cfSelectedDnsRecords.length ? '已选 ' + cfSelectedDnsRecords.length + ' 条' : '' }}</div>
                        </div>
                        <!-- Edit DNS Record Form -->
                        <div v-if="cfEditingRecord" class="bg-blue-50 border border-blue-300 rounded-lg p-4">
                            <h4 class="text-sm font-semibold text-blue-800 mb-3"><i class="fas fa-edit mr-2"></i>编辑 DNS 记录: {{ cfEditingRecord.name }}</h4>
                            <div class="grid grid-cols-2 gap-3 mb-3">
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">类型</label><select v-model="cfEditForm.type" class="w-full px-3 py-2 border rounded-lg text-sm"><option value="A">A</option><option value="AAAA">AAAA</option><option value="CNAME">CNAME</option><option value="MX">MX</option><option value="TXT">TXT</option><option value="NS">NS</option></select></div>
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">名称</label><input v-model="cfEditForm.name" type="text" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">内容</label><input v-model="cfEditForm.content" type="text" class="w-full px-3 py-2 border rounded-lg text-sm"></div>
                                <div><label class="block text-xs font-medium text-gray-600 mb-1">TTL</label><select v-model.number="cfEditForm.ttl" class="w-full px-3 py-2 border rounded-lg text-sm"><option :value="1">Auto</option><option :value="60">60</option><option :value="120">120</option><option :value="300">300</option><option :value="600">600</option><option :value="1800">1800</option><option :value="3600">3600</option></select></div>
                            </div>
                            <div class="flex items-center gap-3 mb-3"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" v-model="cfEditForm.proxied" class="w-4 h-4 text-blue-600 rounded"><span class="text-sm text-gray-700">Cloudflare 代理</span></label></div>
                            <div class="flex gap-2"><button @click="cfSaveEditRecord" :disabled="cfCreating" class="bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600"><i v-if="cfCreating" class="fas fa-spinner fa-spin mr-1"></i>保存</button><button @click="cfCancelEdit" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">取消</button></div>
                        </div>
                        <!-- Add New DNS Record -->
                        <div class="bg-gray-50 rounded-lg p-4">
                            <h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-plus-circle mr-2 text-green-500"></i>新增 DNS A 记录</h4>
                            <div class="space-y-3">
                                <div><label class="block text-sm font-medium text-gray-700 mb-1">记录名称</label><input v-model="cfDnsName" type="text" placeholder="例如: @ 或 www 或 subdomain" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></div>
                                <div><label class="block text-sm font-medium text-gray-700 mb-1">服务器IP（可选）</label><input v-model="cfServerIp" type="text" placeholder="留空则使用1Panel主机IP" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></div>
                                <div class="flex items-center gap-3"><label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" v-model="cfProxied" class="w-4 h-4 text-indigo-600 rounded"><span class="text-sm text-gray-700">启用Cloudflare代理（橙色云朵）</span></label></div>
                                <button @click="cfCreateDns" :disabled="cfCreating" class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-orange-600"><i v-if="cfCreating" class="fas fa-spinner fa-spin mr-1"></i><i v-else class="fab fa-cloudflare mr-1"></i>创建DNS记录</button>
                            </div>
                            <div v-if="cfDnsResult" class="bg-green-50 border border-green-200 rounded-lg p-4 mt-3"><p class="text-green-700 text-sm"><i class="fas fa-check-circle mr-2"></i>DNS A记录创建成功！</p><div class="mt-2 text-xs text-gray-600 space-y-1"><p>类型: {{ cfDnsResult.type }}</p><p>名称: {{ cfDnsResult.name }}</p><p>内容: {{ cfDnsResult.content }}</p><p>代理: {{ cfDnsResult.proxied ? '是' : '否' }}</p></div></div>
                        </div>
                    </div>
                </div>

                <!-- Step 3: WordPress.com Domain Binding -->
                <div v-if="wizardStep === 3" class="p-6 space-y-4">
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2"><p class="text-blue-700 text-sm"><i class="fas fa-info-circle mr-2"></i>绑定自定义域名到 WordPress.com，需先在"系统设置"中配置 WordPress.com 连接。</p></div>
                    <div v-if="!wpcomConnected" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p class="text-yellow-700 text-sm mb-2"><i class="fas fa-exclamation-triangle mr-2"></i>WordPress.com 未连接</p>
                        <p class="text-xs text-gray-600">请前往 <a @click="checkWpcomStatus" class="text-indigo-600 hover:underline cursor-pointer">系统设置</a> 配置 WordPress.com 连接后再使用此功能。</p>
                    </div>
                    <div v-else class="space-y-4">
                        <div class="bg-green-50 border border-green-200 rounded-lg p-4"><p class="text-green-700 text-sm"><i class="fas fa-check-circle mr-2"></i>WordPress.com 已连接 — {{ wpcomEmail }}</p></div>
                        <div v-if="cfSelectedDnsRecords.length" class="bg-gray-50 rounded-lg p-3">
                            <p class="text-sm font-medium text-gray-700 mb-2">从 Step 2 已选 DNS 记录中快速选择:</p>
                            <div class="flex flex-wrap gap-2">
                                <button v-for="r in cfSelectedDnsRecords" :key="r.id" @click="wpcomDomain = r.name" :class="wpcomDomain === r.name ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 border hover:border-blue-400'" class="px-3 py-1.5 rounded-lg text-xs transition">
                                    <span class="font-mono text-current opacity-60 mr-1">{{ r.type }}</span>{{ r.name }}
                                </button>
                            </div>
                        </div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">要绑定的域名</label><input v-model="wpcomDomain" type="text" :placeholder="wizardMode === 'single' ? createForm.site_name || '输入域名...' : '输入域名...'" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"><p class="text-xs text-gray-500 mt-1">输入在 Cloudflare 中已配置的域名，或从上方的 DNS 记录中选择</p></div>
                        <button @click="wpcomBindDomainFn" :disabled="wpcomBinding || !wpcomDomain.trim()" class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 text-sm"><i v-if="wpcomBinding" class="fas fa-spinner fa-spin mr-2"></i><i v-else class="fas fa-link mr-2"></i>绑定到 WordPress.com</button>
                        <div v-if="wpcomResult" class="bg-green-50 border border-green-200 rounded-lg p-4"><p class="text-green-700 text-sm"><i class="fas fa-check-circle mr-2"></i>{{ wpcomResult.message || '域名绑定请求已提交' }}</p></div>
                    </div>
                </div>

                <!-- Step 4: Create Site -->
                <div v-if="wizardStep === 4" class="p-6 space-y-4">
                    <div v-if="!panelConnected" class="bg-red-50 border border-red-200 rounded-lg p-4"><p class="text-red-700 text-sm"><i class="fas fa-exclamation-triangle mr-2"></i>1Panel未连接，站点将仅保存到本地。</p></div>
                    <div v-else class="bg-green-50 border border-green-200 rounded-lg p-4"><p class="text-green-700 text-sm"><i class="fas fa-check-circle mr-2"></i>1Panel已连接，将通过API实际安装WordPress。</p></div>
                    <!-- Selected themes/plugins summary -->
                    <div v-if="selectedThemeIds.length || selectedPluginIds.length" class="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                        <p class="text-sm font-medium text-indigo-700 mb-1"><i class="fas fa-check-circle mr-1"></i>已选配置</p>
                        <p v-if="selectedThemeIds.length" class="text-xs text-indigo-600">主题: {{ selectedThemeIds.length }} 个</p>
                        <p v-if="selectedPluginIds.length" class="text-xs text-indigo-600">插件: {{ selectedPluginIds.length }} 个</p>
                    </div>
                    <!-- Single mode: one domain -->
                    <div v-if="wizardMode === 'single'"><label class="block text-sm font-medium text-gray-700 mb-1">域名 / 站点名称</label><input v-model="createForm.site_name" type="text" placeholder="例如: site1.example.com" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"><p class="text-xs text-gray-500 mt-1">将作为WordPress站点的主域名</p></div>
                    <!-- Batch mode: multiple domains -->
                    <div v-if="wizardMode === 'batch'"><label class="block text-sm font-medium text-gray-700 mb-1">域名列表（每行一个）</label><textarea v-model="createForm.domains" rows="6" placeholder="site1.example.com&#10;site2.example.com&#10;site3.example.com" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></textarea><p class="text-xs text-gray-500 mt-1">每行输入一个域名，将批量创建多个WordPress站点</p></div>
                    <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">WP 管理员用户名</label><input v-model="createForm.admin_name" type="text" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></div><div><label class="block text-sm font-medium text-gray-700 mb-1">WP 管理员密码</label><input v-model="createForm.admin_password" type="text" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></div></div>
                    <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">标签</label><input v-model="createForm.tag" type="text" placeholder="例如: 生产环境" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></div><div><label class="block text-sm font-medium text-gray-700 mb-1">安全ID</label><input v-model="createForm.security_id" type="text" class="w-full px-4 py-3 border rounded-lg focus:border-indigo-500"></div></div>
                    <div class="bg-gray-50 rounded-lg p-4"><h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-shield-alt mr-2"></i>HTTP 认证（可选）</h4><div class="grid grid-cols-2 gap-4"><div><label class="block text-xs font-medium text-gray-600 mb-1">HTTP 用户名</label><input v-model="createForm.http_username" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">HTTP 密码</label><input v-model="createForm.http_password" type="text" class="w-full px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"></div></div></div>
                    <div class="bg-gray-50 rounded-lg p-4"><h4 class="text-sm font-semibold text-gray-700 mb-3"><i class="fas fa-server mr-2"></i>服务器配置</h4><div class="grid grid-cols-3 gap-4"><div><label class="block text-xs font-medium text-gray-600 mb-1">起始端口</label><input v-model.number="createForm.base_port" type="number" min="1024" max="65535" class="w-full px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"></div><div><label class="block text-xs font-medium text-gray-600 mb-1">数据库服务</label><select v-model="createForm.db_service" class="w-full px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"><option value="mariadb">MariaDB</option><option value="mysql">MySQL</option></select></div><div><label class="block text-xs font-medium text-gray-600 mb-1">网站分组</label><select v-model.number="createForm.website_group_id" class="w-full px-3 py-2 border rounded-lg text-sm focus:border-indigo-500"><option value="1">默认分组</option><option v-for="g in panelGroups" :key="g.id" :value="g.id">{{ g.name }}</option></select></div></div></div>
                    <div v-if="createProgress.show" class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div class="flex items-center gap-2 mb-2"><i v-if="!createProgress.results.length" class="fas fa-spinner fa-spin text-blue-600"></i><i v-else class="fas fa-check-circle text-blue-600"></i><span class="text-sm font-semibold text-blue-800">{{ createProgress.message }}</span></div>
                        <div v-if="createProgress.results.length" class="space-y-1 mt-2 max-h-40 overflow-y-auto"><div v-for="(r, i) in createProgress.results" :key="i" class="flex items-center gap-2 text-xs"><i :class="r.status === 'error' ? 'fas fa-times-circle text-red-500' : 'fas fa-check-circle text-green-500'"></i><span class="font-medium">{{ r.domain || '站点' }}</span><span class="text-gray-500">— {{ r.message || (r.status === 'error' ? '失败' : '成功') }}</span></div></div>
                        <div v-if="!createProgress.results.length && wpInstallStatuses[wizardSiteId]" class="text-xs text-blue-600 mt-1">{{ wpInstallStatuses[wizardSiteId].message }}</div>
                    </div>
                </div>

                <!-- Wizard Footer -->
                <div class="p-6 border-t flex gap-3 justify-between">
                    <button v-if="wizardStep > 1" @click="wizardStep--" class="px-6 py-2 border rounded-lg hover:bg-gray-50"><i class="fas fa-arrow-left mr-2"></i>上一步</button>
                    <div v-else></div>
                    <div class="flex gap-3">
                        <template v-if="wizardStep < 4">
                            <button @click="closeWizard" class="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button>
                            <button @click="wizardStep++" class="btn-primary text-white px-6 py-2 rounded-lg">下一步 <i class="fas fa-arrow-right ml-2"></i></button>
                        </template>
                        <template v-if="wizardStep === 4">
                            <button @click="closeWizard" class="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button>
                            <button v-if="wizardMode === 'batch' && createProgress.results.length" @click="closeWizard" class="btn-primary text-white px-6 py-2 rounded-lg"><i class="fas fa-check mr-2"></i>完成</button>
                            <button v-else @click="wizardCreateSite" :disabled="loading || (createProgress.show && !createProgress.results.length)" class="btn-primary text-white px-6 py-2 rounded-lg"><i v-if="loading" class="fas fa-spinner fa-spin mr-2"></i><i v-else class="fas fa-rocket mr-2"></i>{{ wizardMode === 'batch' ? '批量创建' : '创建站点' }}</button>
                        </template>
                    </div>
                </div>
            </div>
        </div>

        <!-- Edit Modal -->
        <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
            <div class="bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto w-full max-w-2xl mx-4 fade-in">
                <div class="p-6 border-b flex items-center justify-between"><h2 class="text-lg font-bold">编辑站点</h2><button @click="showEditModal = false" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button></div>
                <div class="p-6 space-y-4">
                    <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">站点名称</label><input v-model="editForm.site_name" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div><div><label class="block text-sm font-medium text-gray-700 mb-1">URL</label><input v-model="editForm.url" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div></div>
                    <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">管理员</label><input v-model="editForm.admin_name" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div><div><label class="block text-sm font-medium text-gray-700 mb-1">管理员密码</label><input v-model="editForm.admin_password" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div></div>
                    <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">标签</label><input v-model="editForm.tag" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div><div><label class="block text-sm font-medium text-gray-700 mb-1">安全ID</label><input v-model="editForm.security_id" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div></div>
                    <div class="grid grid-cols-2 gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">HTTP 用户名</label><input v-model="editForm.http_username" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div><div><label class="block text-sm font-medium text-gray-700 mb-1">HTTP 密码</label><input v-model="editForm.http_password" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-indigo-500"></div></div>
                </div>
                <div class="p-6 border-t flex gap-3 justify-end"><button @click="showEditModal = false" class="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button><button @click="submitEdit" :disabled="loading" class="btn-primary text-white px-6 py-2 rounded-lg"><i v-if="loading" class="fas fa-spinner fa-spin mr-2"></i>保存更改</button></div>
            </div>
        </div>

        <!-- Feed Product Edit Modal -->
        <div v-if="showFeedProductModal" class="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
            <div class="bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto w-full max-w-2xl mx-4 fade-in">
                <div class="p-6 border-b flex items-center justify-between"><h2 class="text-lg font-bold">{{ feedEditId ? '编辑商品' : '添加商品' }}</h2><button @click="closeFeedProductModal" class="text-gray-400 hover:text-gray-600"><i class="fas fa-times text-xl"></i></button></div>
                <div class="p-6 space-y-4">
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">商品标题 <span class="text-red-500">*</span></label><input v-model="feedEditForm.title" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">描述</label><textarea v-model="feedEditForm.description" rows="2" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></textarea></div>
                    <div class="grid grid-cols-3 gap-4">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">价格</label><input v-model="feedEditForm.price" placeholder="29.99 USD" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">币种</label><select v-model="feedEditForm.currency" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option><option value="CNY">CNY</option></select></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">库存状态</label><select v-model="feedEditForm.availability" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"><option value="in_stock">有货 (in_stock)</option><option value="out_of_stock">缺货 (out_of_stock)</option><option value="preorder">预定 (preorder)</option></select></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">品牌</label><input v-model="feedEditForm.brand" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">GTIN</label><input v-model="feedEditForm.gtin" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">MPN</label><input v-model="feedEditForm.mpn" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                    </div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">Google 商品类别</label><input v-model="feedEditForm.google_product_category" placeholder="Apparel & Accessories > Clothing > ..." type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">商品类型</label><input v-model="feedEditForm.product_type" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">状态</label><select v-model="feedEditForm.condition" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"><option value="new">全新 (new)</option><option value="used">二手 (used)</option><option value="refurbished">翻新 (refurbished)</option></select></div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">图片 URL</label><input v-model="feedEditForm.image_url" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                        <div><label class="block text-sm font-medium text-gray-700 mb-1">商品链接</label><input v-model="feedEditForm.link" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                    </div>
                    <div><label class="block text-sm font-medium text-gray-700 mb-1">运费</label><input v-model="feedEditForm.shipping" placeholder="US:0.00 USD" type="text" class="w-full px-4 py-2 border rounded-lg focus:border-green-500"></div>
                </div>
                <div class="p-6 border-t flex gap-3 justify-end"><button @click="closeFeedProductModal" class="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button><button @click="handleSaveFeedProduct" class="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600"><i class="fas fa-check mr-2"></i>{{ feedEditId ? '更新' : '添加' }}</button></div>
            </div>
        </div>

        <!-- Confirm Modal -->
        <div v-if="modal.show" class="fixed inset-0 z-50 flex items-center justify-center modal-overlay">
            <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 fade-in"><div class="p-6"><h2 class="text-lg font-bold text-gray-800 mb-2">{{ modal.title }}</h2><p class="text-gray-600">{{ modal.content }}</p></div><div class="p-6 border-t flex gap-3 justify-end"><button @click="modal.show = false" class="px-6 py-2 border rounded-lg hover:bg-gray-50">取消</button><button @click="modal.onConfirm()" class="bg-red-500 text-white px-6 py-2 rounded-lg hover:bg-red-600">删除</button></div></div>
        </div>

        <!-- Toast -->
        <div v-if="toast.show" class="toast fade-in">
            <div :class="['rounded-lg shadow-lg px-6 py-4 flex items-center gap-3', toast.type === 'success' ? 'bg-green-500 text-white' : toast.type === 'error' ? 'bg-red-500 text-white' : 'bg-blue-500 text-white']">
                <i :class="toast.type === 'success' ? 'fas fa-check-circle' : toast.type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-info-circle'"></i><span>{{ toast.message }}</span>
            </div>
        </div>
    </div>
    `,
});

app.mount('#app');
