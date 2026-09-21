/**
 * Agribank Questions Search Engine
 * Features:
 * - Google Material 3 UI logic
 * - Dedicated Question-Only search (Chỉ tìm kiếm trong nội dung câu hỏi)
 * - Accent-insensitive Vietnamese search (tìm kiếm không dấu)
 * - Multi-word keyword matching (tìm nhiều từ khóa cách nhau)
 * - Dynamic category & exam batch filtering (Đợt 1 / Đợt 2 / Chuyên đề)
 * - Lazy rendering / pagination for optimal mobile performance
 * - Offline file:// and GitHub Pages compatibility
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
     * Load questions from global variable (via questions.js) or fallback to fetch API
     */
    async function initData() {
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
                        <div style="font-size:2rem; margin-bottom:8px;">⚠️</div>
                        <p>Không thể tải tệp dữ liệu câu hỏi.</p>
                        <p style="font-size:0.85em; margin-top:6px; color:#888;">${err.message}</p>
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
        bindEvents();
        doFilter();
    }

    /**
     * Populate filter dropdown dynamically with optgroups for Batches and Categories
     */
    function setupFilterOptions() {
        const catMap = new Map();
        const batchMap = new Map();
        const detailMap = new Map();

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

        // Fallback for partial word typing (before word boundary is completed)
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

        // 4. Merge overlapping or adjacent intervals so the whole phrase is joined together
        const merged = [];
        let cur = intervals[0];

        for (let j = 1; j < intervals.length; j++) {
            const next = intervals[j];
            if (next[0] <= cur[1]) {
                cur[1] = Math.max(cur[1], next[1]);
            } else {
                const gap = text.slice(cur[1], next[0]);
                // If only whitespace between adjacent matched words, merge them into 1 contiguous highlight
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
                    <div style="font-size:2.2rem; margin-bottom:8px;">🔍</div>
                    <p style="font-weight:500;">Không tìm thấy câu hỏi nào phù hợp.</p>
                    <p style="font-size:0.85rem; margin-top:6px; color:#747775;">Hãy thử tìm bằng từ khoá ngắn hơn hoặc chọn lại chuyên đề/đợt thi.</p>
                </div>
            `;
            return;
        }

        renderNextPage(rawQuery);
    }

    /**
     * Render next chunk of questions to DOM
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
            if (q.batches && q.batches.length > 1) {
                batchClass = 'batch-both';
            } else if (q.batches && q.batches.includes('Đợt 2')) {
                batchClass = 'batch-d2';
            }

            card.innerHTML = `
                <div class="question-header">
                    <div class="tags-group">
                        <span class="category-tag">${escapeHtml(q.category)}</span>
                        <span class="batch-tag ${batchClass}">${escapeHtml(q.batch_label || 'Đợt 1')}</span>
                    </div>
                    <span class="question-number">#${q.id}</span>
                </div>
                <div class="question-text">${highlight(q.question, query)}</div>
                <div class="answers-list">
                    <div class="answer ${correctIdx === '1' ? 'correct' : ''}">1. ${escapeHtml(q.a1)}</div>
                    <div class="answer ${correctIdx === '2' ? 'correct' : ''}">2. ${escapeHtml(q.a2)}</div>
                    <div class="answer ${correctIdx === '3' ? 'correct' : ''}">3. ${escapeHtml(q.a3)}</div>
                    ${q.a4 ? `<div class="answer ${correctIdx === '4' ? 'correct' : ''}">4. ${escapeHtml(q.a4)}</div>` : ''}
                </div>
                ${q.source ? `<div class="source"><span class="source-label">Nguồn:</span> ${escapeHtml(q.source)}</div>` : ''}
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

        // Back to top floating action button
        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
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
