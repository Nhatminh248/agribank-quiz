/**
 * Agribank Questions Search Engine
 * Features:
 * - Google Material 3 (Material You) UI logic with Peachy Accent
 * - Tonal Color Theme & Dark Mode switching with localStorage & system preference
 * - M3 Filter Chips Carousel seamlessly synchronized with Granular Select
 * - Question-Only search with diacritics-insensitive Vietnamese matching
 * - Multi-word contiguous keyword highlighting
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
    const chipsScroll = document.getElementById('chipsScroll');
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
            themeMetaColor.setAttribute('content', '#1a1110');
        } else {
            themeMetaColor.setAttribute('content', '#fff8f6');
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

        // Precompute normalized searchable strings STRICTLY for Question Text
        allQuestions.forEach((q, idx) => {
            if (!q.id) q.id = idx + 1;
            q._normalized_q = removeVietnameseTones(q.question || '');
        });

        setupFilterOptions();
        setupChipsCarousel();
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
     * Build horizontal Material 3 Filter Chips Carousel
     */
    function setupChipsCarousel() {
        if (!chipsScroll) return;

        const checkSvg = `
            <svg class="chip-check-icon" viewBox="0 0 24 24">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
        `;

        const chipDefs = [
            { id: 'all', label: 'Tất cả', count: allQuestions.length }
        ];

        ['Đợt 1', 'Đợt 2'].forEach(b => {
            if (batchMap.has(b)) {
                chipDefs.push({ id: `batch:${b}`, label: b, count: batchMap.get(b) });
            }
        });

        Array.from(catMap.entries())
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, count]) => {
                chipDefs.push({ id: `cat:${cat}`, label: cat, count });
            });

        let chipsHtml = '';
        chipDefs.forEach((chip, idx) => {
            const isSelected = idx === 0 ? 'selected' : '';
            chipsHtml += `
                <button type="button" class="m3-filter-chip ${isSelected}" data-val="${chip.id}" role="tab" aria-selected="${idx === 0 ? 'true' : 'false'}">
                    ${checkSvg}
                    <span>${escapeHtml(chip.label)}</span>
                    <span class="chip-count">${chip.count}</span>
                </button>
            `;
        });

        chipsScroll.innerHTML = chipsHtml;

        // Add click events to chips
        chipsScroll.querySelectorAll('.m3-filter-chip').forEach(chipEl => {
            chipEl.addEventListener('click', () => {
                const targetVal = chipEl.getAttribute('data-val');
                selectFilterVal(targetVal);
            });
        });
    }

    /**
     * Synchronize chip state and dropdown selection
     */
    function selectFilterVal(val) {
        categorySelect.value = val;

        // Highlight matching chip if available
        chipsScroll.querySelectorAll('.m3-filter-chip').forEach(chip => {
            if (chip.getAttribute('data-val') === val) {
                chip.classList.add('selected');
                chip.setAttribute('aria-selected', 'true');
                chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                chip.classList.remove('selected');
                chip.setAttribute('aria-selected', 'false');
            }
        });

        doFilter();
    }

    /**
     * Check if a character is alphanumeric (for whole word/boundary detection)
     */
    function isWordChar(char) {
        return char && /[a-z0-9]/i.test(char);
    }

    /**
     * Highlight matching phrases and words in question text seamlessly as contiguous blocks
     */
    function highlight(text, rawQuery) {
        if (!text || !rawQuery) return escapeHtml(text);
        const cleanQuery = rawQuery.trim();
        if (!cleanQuery) return escapeHtml(text);

        const normalizedText = removeVietnameseTones(text);
        const normalizedQuery = removeVietnameseTones(cleanQuery);
        const words = normalizedQuery.split(/\s+/).filter(Boolean);
        if (words.length === 0) return escapeHtml(text);

        // 1. Extract maximal contiguous sub-phrases from query that exist in the text
        const targetPhrases = [];
        let i = 0;
        while (i < words.length) {
            let bestPhrase = null;
            let bestLen = 0;
            for (let len = words.length - i; len >= 1; len--) {
                const candidate = words.slice(i, i + len).join(' ');
                if (normalizedText.includes(candidate)) {
                    bestPhrase = candidate;
                    bestLen = len;
                    break;
                }
            }
            if (bestPhrase) {
                targetPhrases.push(bestPhrase);
                i += bestLen;
            } else {
                targetPhrases.push(words[i]);
                i += 1;
            }
        }

        // 2. Find interval occurrences for each target phrase
        const intervals = [];
        targetPhrases.forEach(phrase => {
            let pos = 0;
            while ((pos = normalizedText.indexOf(phrase, pos)) !== -1) {
                const start = pos;
                const end = pos + phrase.length;
                const prev = pos > 0 ? normalizedText[pos - 1] : ' ';
                const next = end < normalizedText.length ? normalizedText[end] : ' ';

                // Prefer whole word/phrase boundaries
                if (!isWordChar(prev) && !isWordChar(next)) {
                    intervals.push([start, end]);
                }
                pos += 1;
            }
        });

        // Fallback for partial word typing
        if (intervals.length === 0) {
            targetPhrases.forEach(phrase => {
                let pos = 0;
                while ((pos = normalizedText.indexOf(phrase, pos)) !== -1) {
                    intervals.push([pos, pos + phrase.length]);
                    pos += 1;
                }
            });
        }

        if (intervals.length === 0) return escapeHtml(text);

        // 3. Sort intervals by start index
        intervals.sort((a, b) => a[0] - b[0] || b[1] - a[1]);

        // 4. Merge overlapping or adjacent intervals
        const merged = [];
        let cur = intervals[0];

        for (let j = 1; j < intervals.length; j++) {
            const next = intervals[j];
            if (next[0] <= cur[1]) {
                cur[1] = Math.max(cur[1], next[1]);
            } else {
                const gap = text.slice(cur[1], next[0]);
                if (/^\s+$/.test(gap)) {
                    cur[1] = next[1];
                } else {
                    merged.push(cur);
                    cur = next;
                }
            }
        }
        merged.push(cur);

        // 5. Build HTML with seamless contiguous <mark> tags
        let result = '';
        let lastIdx = 0;
        for (const [start, end] of merged) {
            if (start > lastIdx) {
                result += escapeHtml(text.slice(lastIdx, start));
            }
            result += '<mark>' + escapeHtml(text.slice(start, end)) + '</mark>';
            lastIdx = end;
        }
        if (lastIdx < text.length) {
            result += escapeHtml(text.slice(lastIdx));
        }
        return result;
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
                    selectFilterVal('all');
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
            const val = categorySelect.value;
            // Sync chips
            chipsScroll.querySelectorAll('.m3-filter-chip').forEach(chip => {
                if (chip.getAttribute('data-val') === val) {
                    chip.classList.add('selected');
                    chip.setAttribute('aria-selected', 'true');
                    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                } else {
                    chip.classList.remove('selected');
                    chip.setAttribute('aria-selected', 'false');
                }
            });
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
