/**
 * Agribank Questions Search Engine
 * Features:
 * - Google Material 3 (Material You) UI logic with Peachy Accent
 * - Tonal Color Theme & Dark Mode switching with localStorage & system preference
 * - M3 Filter Chips Carousel seamlessly synchronized with Granular Select
 * - Question-Only search with diacritics-insensitive Vietnamese matching
 * - Word-by-word keyword highlighting
 * - Optimized pagination & DOM rendering
 * - Keyboard shortcuts ('/' to search, Esc to clear)
 */

(function () {
    let allQuestions = [];
    let currentFiltered = [];
    let renderedCount = 0;
    const PAGE_SIZE = 40;

    // DOM Elements
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearBtn');
    const categorySelect = document.getElementById('categorySelect');
    const statsBadge = document.getElementById('statsBadge');
    const resultsContainer = document.getElementById('results');
    const backToTopBtn = document.getElementById('backToTop');
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeMetaColor = document.getElementById('themeMetaColor');

    /**
     * Vietnamese diacritic remover and normalizer
     */
    function removeVietnameseTones(str) {
        if (!str) return '';
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .toLowerCase();
    }

    /**
     * Initialize Theme Mode (Light / Dark)
     */
    function initTheme() {
        const savedTheme = localStorage.getItem('m3_quiz_theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateMetaThemeColor(savedTheme);
        } else {
            // Auto match system
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            updateMetaThemeColor(prefersDark ? 'dark' : 'light');
        }

        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                let newTheme = 'light';
                if (!currentTheme) {
                    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                    newTheme = prefersDark ? 'light' : 'dark';
                } else if (currentTheme === 'light') {
                    newTheme = 'dark';
                } else {
                    newTheme = 'light';
                }

                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('m3_quiz_theme', newTheme);
                updateMetaThemeColor(newTheme);
            });
        }

        // Listen for OS theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                if (!localStorage.getItem('m3_quiz_theme')) {
                    updateMetaThemeColor(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    function updateMetaThemeColor(theme) {
        if (!themeMetaColor) return;
        if (theme === 'dark') {
            themeMetaColor.setAttribute('content', '#0f1511');
        } else {
            themeMetaColor.setAttribute('content', '#f6fbf4');
        }
    }

    /**
     * Load questions from global variable (via questions.js) or fallback to fetch API
     */
    async function initData() {
        initTheme();

        if (window.QUESTIONS_DATA && Array.isArray(window.QUESTIONS_DATA) && window.QUESTIONS_DATA.length > 0) {
            allQuestions = window.QUESTIONS_DATA;
        } else {
            try {
                const response = await fetch('data/questions.json');
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                allQuestions = await response.json();
            } catch (err) {
                console.error('Failed to fetch data/questions.json:', err);
                resultsContainer.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <p style="font-weight:600; font-size:1.05rem;">Không thể tải tệp dữ liệu câu hỏi</p>
                        <p style="font-size:0.85em; margin-top:6px; color:var(--md-sys-color-on-surface-muted);">${err.message}</p>
                    </div>
                `;
                return;
            }
        }

        // Normalize strings to Unicode NFC and precompute normalized searchable strings STRICTLY for Question Text
        allQuestions.forEach((q, idx) => {
            if (!q.id) q.id = idx + 1;
            q.question = (q.question || '').normalize('NFC');
            if (q.a1) q.a1 = q.a1.normalize('NFC');
            if (q.a2) q.a2 = q.a2.normalize('NFC');
            if (q.a3) q.a3 = q.a3.normalize('NFC');
            if (q.a4) q.a4 = q.a4.normalize('NFC');
            if (q.source) q.source = q.source.normalize('NFC');
            if (q.category) q.category = q.category.normalize('NFC');
            q._normalized_q = removeVietnameseTones(q.question);
        });

        setupFilterOptions();
        bindEvents();
        doFilter();
    }

    /**
     * Populate filter dropdown dynamically with optgroups for Batches and Categories
     */
    let catMap = new Map();
    let batchMap = new Map();
    let detailMap = new Map();

    function setupFilterOptions() {
        catMap.clear();
        batchMap.clear();
        detailMap.clear();

        allQuestions.forEach(q => {
            const cat = q.category || 'Chưa phân loại';
            catMap.set(cat, (catMap.get(cat) || 0) + 1);

            const batches = q.batches || ['Đợt 1'];
            batches.forEach(b => {
                batchMap.set(b, (batchMap.get(b) || 0) + 1);
                const detailKey = `${b}|${cat}`;
                detailMap.set(detailKey, (detailMap.get(detailKey) || 0) + 1);
            });
        });

        let html = `<option value="all">Tất cả ngân hàng đề (${allQuestions.length} câu)</option>`;

        // Group: Theo Đợt thi
        html += `<optgroup label="─── THEO ĐỢT THI ───">`;
        ['Đợt 1', 'Đợt 2'].forEach(b => {
            if (batchMap.has(b)) {
                html += `<option value="batch:${b}">Tất cả ${b} (${batchMap.get(b)} câu)</option>`;
            }
        });
        html += `</optgroup>`;

        // Group: Theo Chuyên đề
        html += `<optgroup label="─── THEO CHUYÊN ĐỀ (TẤT CẢ ĐỢT) ───">`;
        Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
            html += `<option value="cat:${cat}">${cat} (${count} câu)</option>`;
        });
        html += `</optgroup>`;

        // Group: Chi tiết Đợt 1
        html += `<optgroup label="─── CHI TIẾT ĐỢT 1 ───">`;
        Array.from(detailMap.entries())
            .filter(([key]) => key.startsWith('Đợt 1|'))
            .sort((a, b) => b[1] - a[1])
            .forEach(([key, count]) => {
                const [, cat] = key.split('|');
                html += `<option value="detail:${key}">Đợt 1: ${cat} (${count} câu)</option>`;
            });
        html += `</optgroup>`;

        // Group: Chi tiết Đợt 2
        html += `<optgroup label="─── CHI TIẾT ĐỢT 2 ───">`;
        Array.from(detailMap.entries())
            .filter(([key]) => key.startsWith('Đợt 2|'))
            .sort((a, b) => b[1] - a[1])
            .forEach(([key, count]) => {
                const [, cat] = key.split('|');
                html += `<option value="detail:${key}">Đợt 2: ${cat} (${count} câu)</option>`;
            });
        html += `</optgroup>`;

        categorySelect.innerHTML = html;
    }

    /**
     * Highlight matching words in question text word-by-word
     */
    function highlight(text, rawQuery) {
        if (!text || !rawQuery) return escapeHtml(text);
        const cleanQuery = rawQuery.trim();
        if (!cleanQuery) return escapeHtml(text);

        const normText = text.normalize('NFC');
        const queryWords = cleanQuery.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu) || [];
        if (queryWords.length === 0) return escapeHtml(normText);

        const termMap = queryWords.map(w => {
            const lower = w.toLowerCase();
            const norm = removeVietnameseTones(w);
            const hasTone = lower !== norm;
            return { raw: lower, norm: norm, hasTone: hasTone };
        });

        // Split text into word tokens and non-word delimiters (spaces, punctuation)
        const tokens = normText.split(/([\p{L}\p{M}\p{N}]+)/u);

        return tokens.map(token => {
            if (!token) return '';
            // If token is a delimiter/whitespace, escape and return as-is
            if (!/^[\p{L}\p{M}\p{N}]+$/u.test(token)) {
                return escapeHtml(token);
            }

            const tokenLower = token.toLowerCase();
            const tokenNorm = removeVietnameseTones(token);

            const matches = termMap.some(term => {
                if (term.hasTone) {
                    if (tokenLower === term.raw) return true;
                    // Allow prefix match for longer multi-syllable/brand words (e.g. Agri -> Agribank)
                    if (term.raw.length >= 4 && tokenLower.startsWith(term.raw)) return true;
                    return false;
                } else {
                    if (tokenNorm === term.norm) return true;
                    // Allow prefix match for longer multi-syllable/brand words (e.g. Agri -> Agribank)
                    if (term.norm.length >= 4 && tokenNorm.startsWith(term.norm)) return true;
                    return false;
                }
            });

            if (matches) {
                return '<mark>' + escapeHtml(token) + '</mark>';
            }
            return escapeHtml(token);
        }).join('');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Calculate search relevance score for a question:
     * - Exact phrase matches (with/without accents) get top priority
     * - Adjacent multi-word bigrams get high priority
     * - Whole-word matches prioritized over accidental substring matches
     * - Questions starting with query get bonus
     */
    function getRelevanceScore(q, rawQuery, normQuery, queryTerms) {
        let score = 0;
        const qRaw = q.question.toLowerCase();
        const qNorm = q._normalized_q;

        // 1. Exact phrase match (with diacritics = 2000, without diacritics = 1000)
        if (qRaw.includes(rawQuery.toLowerCase())) {
            score += 2000;
        } else if (qNorm.includes(normQuery)) {
            score += 1000;
        }

        // 2. Adjacent multi-word bigrams
        if (queryTerms.length > 1) {
            for (let i = 0; i < queryTerms.length - 1; i++) {
                const bigram = queryTerms[i] + ' ' + queryTerms[i + 1];
                if (qNorm.includes(bigram)) {
                    score += 200;
                }
            }
        }

        // 3. Whole-word matches (reward actual words over accidental substring matches)
        for (let i = 0; i < queryTerms.length; i++) {
            const term = queryTerms[i];
            const wordRegex = new RegExp('(^|[^\\p{L}\\p{N}])' + term + '($|[^\\p{L}\\p{N}])', 'u');
            if (wordRegex.test(qNorm)) {
                score += 100;
            }
        }

        // 4. Starts with keyword
        if (qNorm.startsWith(normQuery)) {
            score += 150;
        }

        return score;
    }

    /**
     * Filter questions based on keyword (Question ONLY) and selected Category/Batch
     */
    function doFilter() {
        const rawQuery = searchInput.value.trim();
        const selectedVal = categorySelect.value || 'all';
        const normalizedQuery = removeVietnameseTones(rawQuery);
        
        // Toggle clear button
        if (rawQuery.length > 0) {
            clearBtn.classList.add('active');
        } else {
            clearBtn.classList.remove('active');
        }

        const queryTerms = normalizedQuery.split(/\s+/).filter(Boolean);

        currentFiltered = allQuestions.filter(q => {
            // Category & Batch filter
            if (selectedVal !== 'all') {
                if (selectedVal.startsWith('batch:')) {
                    const targetBatch = selectedVal.replace('batch:', '');
                    if (!q.batches || !q.batches.includes(targetBatch)) return false;
                } else if (selectedVal.startsWith('cat:')) {
                    const targetCat = selectedVal.replace('cat:', '');
                    if (q.category !== targetCat) return false;
                } else if (selectedVal.startsWith('detail:')) {
                    const [b, c] = selectedVal.replace('detail:', '').split('|');
                    if (!q.batches || !q.batches.includes(b) || q.category !== c) return false;
                }
            }

            // Keyword match STRICTLY on Question text (AND-based: all terms must match)
            if (queryTerms.length > 0) {
                for (let i = 0; i < queryTerms.length; i++) {
                    if (!q._normalized_q.includes(queryTerms[i])) {
                        return false;
                    }
                }
            }
            return true;
        });

        // Rank results by relevance if a search query is active
        if (queryTerms.length > 0) {
            currentFiltered.sort((a, b) => {
                const scoreA = getRelevanceScore(a, rawQuery, normalizedQuery, queryTerms);
                const scoreB = getRelevanceScore(b, rawQuery, normalizedQuery, queryTerms);
                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }
                return a.id - b.id;
            });
        }

        // Update stats badge
        statsBadge.textContent = `${currentFiltered.length} câu`;

        // Render first page
        renderedCount = 0;
        resultsContainer.innerHTML = '';

        if (currentFiltered.length === 0) {
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 14z"/>
                        </svg>
                    </div>
                    <p style="font-weight:600; font-size:1.05rem;">Không tìm thấy câu hỏi phù hợp</p>
                    <p style="font-size:0.88rem; margin-top:6px; color:var(--md-sys-color-on-surface-muted);">Hãy thử bằng từ khoá khác hoặc đặt lại bộ lọc.</p>
                    <button class="reset-filter-btn" id="resetFilterBtn">Đặt lại tìm kiếm & bộ lọc</button>
                </div>
            `;
            const resetBtn = document.getElementById('resetFilterBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    categorySelect.value = 'all';
                    doFilter();
                });
            }
            return;
        }

        renderNextPage(rawQuery);
    }

    /**
     * Render next chunk of questions to DOM with Material 3 styling
     */
    function renderNextPage(query) {
        const nextItems = currentFiltered.slice(renderedCount, renderedCount + PAGE_SIZE);
        if (nextItems.length === 0) return;

        const fragment = document.createDocumentFragment();

        nextItems.forEach((q) => {
            const card = document.createElement('div');
            card.className = 'question-card';

            const correctIdx = String(q.correct).trim();

            let batchClass = 'batch-d1';
            let batchIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>`;
            if (q.batches && q.batches.length > 1) {
                batchClass = 'batch-both';
                batchIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 2l-5.5 9h11z M12 22l5.5-9h-11z"/></svg>`;
            } else if (q.batches && q.batches.includes('Đợt 2')) {
                batchClass = 'batch-d2';
            }

            const answersHtml = [
                { num: '1', text: q.a1 },
                { num: '2', text: q.a2 },
                { num: '3', text: q.a3 },
                { num: '4', text: q.a4 }
            ].filter(a => Boolean(a.text)).map(a => {
                const isCorrect = correctIdx === a.num;
                return `
                    <div class="answer ${isCorrect ? 'correct' : ''}">
                        <span class="opt-index">${isCorrect ? '✓' : a.num}</span>
                        <span class="opt-content">${escapeHtml(a.text)}</span>
                        ${isCorrect ? '<span class="correct-badge">Đáp án đúng</span>' : ''}
                    </div>
                `;
            }).join('');

            card.innerHTML = `
                <div class="question-header">
                    <div class="tags-group">
                        <span class="category-tag">${escapeHtml(q.category)}</span>
                        <span class="batch-tag ${batchClass}">
                            ${batchIcon}
                            ${escapeHtml(q.batch_label || 'Đợt 1')}
                        </span>
                    </div>
                    <span class="question-number">#${q.id}</span>
                </div>
                <div class="question-text">${highlight(q.question, query)}</div>
                <div class="answers-list">
                    ${answersHtml}
                </div>
                ${q.source ? `
                <div class="source">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
                    </svg>
                    <span class="source-label">Nguồn:</span>
                    <span>${escapeHtml(q.source)}</span>
                </div>` : ''}
            `;

            fragment.appendChild(card);
        });

        resultsContainer.appendChild(fragment);
        renderedCount += nextItems.length;

        // Remove old load more button if exists
        const oldBtn = document.getElementById('loadMoreBtn');
        if (oldBtn) oldBtn.remove();

        // Add load more button if there are more items
        if (renderedCount < currentFiltered.length) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.id = 'loadMoreBtn';
            loadMoreBtn.className = 'load-more-btn';
            const remaining = currentFiltered.length - renderedCount;
            loadMoreBtn.textContent = `Xem thêm câu hỏi (còn ${remaining} câu)`;
            loadMoreBtn.onclick = () => renderNextPage(query);
            resultsContainer.appendChild(loadMoreBtn);
        }
    }

    /**
     * Bind UI event listeners
     */
    function bindEvents() {
        let debounceTimer;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(doFilter, 120);
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            searchInput.focus();
            doFilter();
        });

        categorySelect.addEventListener('change', () => {
            doFilter();
        });

        // Keyboard shortcuts: '/' or 'Ctrl+K' / 'Cmd+K' to focus search
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== searchInput) {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                searchInput.focus();
                searchInput.select();
            } else if (e.key === 'Escape' && document.activeElement === searchInput) {
                if (searchInput.value) {
                    searchInput.value = '';
                    doFilter();
                } else {
                    searchInput.blur();
                }
            }
        });

        // Back to top floating action button
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTransBackToTop(true);
            }
        });

        function backToTransBackToTop(visible) {
            if (visible) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        }

        window.addEventListener('scroll', () => {
            backToTransBackToTop(window.scrollY > 280);
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initData);
    } else {
        initData();
    }
})();
