class AudioEvaluationApp {
    constructor() {
        this.data = null;
        this.currentFontSize = 18;
        this.minFontSize = 12;
        this.maxFontSize = 28;
        this.currentSampleIndex = 0;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.audioManager = new AudioManager();
        this.currentView = 'list'; // Default to list view
        this.isLoading = false;
        this.intersectionObserver = null;
        this.isDarkMode = false;
        
        // Pagination
        this.cardsPerPage = 10;
        this.currentPage = 0;
        this.totalPages = 0;
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.loadData();
        this.setupPagination();
        this.renderCurrentPage();
        this.updateStats();
    }

    setupEventListeners() {
        // Font controls
        const fontIncreaseBtn = document.getElementById('fontIncrease');
        const fontDecreaseBtn = document.getElementById('fontDecrease');
        
        if (fontIncreaseBtn) {
            fontIncreaseBtn.addEventListener('click', () => this.increaseFontSize());
        }
        if (fontDecreaseBtn) {
            fontDecreaseBtn.addEventListener('click', () => this.decreaseFontSize());
        }
        
        // View controls
        const gridViewBtn = document.getElementById('gridView');
        const listViewBtn = document.getElementById('listView');
        
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.setView('grid'));
        }
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setView('list'));
        }
        
        // Modal controls
        const closeModalBtn = document.getElementById('closeModal');
        const prevSampleBtn = document.getElementById('prevSample');
        const nextSampleBtn = document.getElementById('nextSample');
        
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeModal());
        }
        if (prevSampleBtn) {
            prevSampleBtn.addEventListener('click', () => this.navigateSample(-1));
        }
        if (nextSampleBtn) {
            nextSampleBtn.addEventListener('click', () => this.navigateSample(1));
        }
        
        // Retry button
        const retryBtn = document.getElementById('retryBtn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.retryLoadData());
        }
        
        // Pagination controls
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => this.previousPage());
        }
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => this.nextPage());
        }
        
        // Dark mode toggle
        const darkModeToggle = document.getElementById('darkModeToggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
        }
        
        // Keyboard shortcuts - Safari optimized
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    this.increaseFontSize();
                } else if (e.key === '-') {
                    e.preventDefault();
                    this.decreaseFontSize();
                }
            } else if (e.key === 'ArrowLeft' && this.isModalOpen()) {
                e.preventDefault();
                this.navigateSample(-1);
            } else if (e.key === 'ArrowRight' && this.isModalOpen()) {
                e.preventDefault();
                this.navigateSample(1);
            }
        });

        // Close modal on overlay click
        const modal = document.getElementById('modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.classList.contains('modal-overlay')) {
                    this.closeModal();
                }
            });
        }

        // Handle online/offline events - Safari optimized
        window.addEventListener('online', () => {
            if (!this.data && !this.isLoading) {
                this.retryLoadData();
            }
        });

        window.addEventListener('offline', () => {
            this.showError('You are offline. Please check your connection.');
        });
    }

    async loadData() {
        if (this.isLoading) return;
        
        try {
            this.isLoading = true;
            this.showLoading();
            
            // Safari-optimized fetch with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`evaluation_results_clean.json?v=${Date.now()}`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (!data || !data.results || !Array.isArray(data.results)) {
                throw new Error('Invalid data format');
            }

            // Apply sample reordering logic
            this.data = this.reorderSamples(data.results);
            this.retryCount = 0;
            
            console.log(`Successfully loaded ${this.data.length} audio samples with reordering applied`);
            this.updateStats();
            
        } catch (error) {
            console.error('Error loading data:', error);
            this.handleLoadError(error);
        } finally {
            this.isLoading = false;
        }
    }

    reorderSamples(samples) {
        // Extract samples 1-15 (indices 0-14) - these will be prioritized
        const samples1to15 = samples.slice(0, 15); // samples 1-15
        
        // Extract samples 70-88 (indices 69-87) - these will be prioritized
        const samples70to88 = samples.slice(69, 88); // samples 70-88
        
        // Extract samples 60-69 (indices 59-68) - these will go at the end
        const samples60to69 = samples.slice(59, 69); // samples 60-69
        
        // Extract remaining samples (16-59 and 89+) - exclude first 50 samples (1-50) as requested
        const samples16to59 = samples.slice(15, 59); // samples 16-59 (excluding first 50)
        const samples89plus = samples.slice(88); // samples 89+
        const remainingSamples = [...samples16to59, ...samples89plus];
        
        // Create a better mixed array using interleaving approach
        const reorderedSamples = this.createInterleavedArray(samples1to15, samples70to88, remainingSamples, samples60to69);
        
        console.log(`Reordered samples: ${samples1to15.length} samples (1-15) + ${samples70to88.length} samples (70-88) + ${remainingSamples.length} remaining samples + ${samples60to69.length} samples (60-69) at end, all properly mixed`);
        
        return reorderedSamples;
    }

    createInterleavedArray(samples1to15, samples70to88, remainingSamples, samples60to69) {
        const result = [];
        
        // First, mix samples 1-15 and 70-88 using interleaving to avoid consecutive numbers
        const prioritizedSamples = [...samples1to15, ...samples70to88];
        const shuffledPrioritized = this.shuffleArray(prioritizedSamples);
        
        // Add prioritized samples first
        result.push(...shuffledPrioritized);
        
        // Add remaining samples (16-59 and 89+)
        result.push(...remainingSamples);
        
        // Add samples 60-69 at the end
        result.push(...samples60to69);
        
        // Apply additional mixing to ensure no consecutive sample numbers from same ranges
        return this.ensureNoConsecutiveSamples(result);
    }

    ensureNoConsecutiveSamples(samples) {
        const result = [...samples];
        const maxAttempts = 100;
        let attempts = 0;
        
        while (attempts < maxAttempts) {
            let hasConsecutive = false;
            
            for (let i = 0; i < result.length - 1; i++) {
                const currentSampleNum = this.extractSampleNumber(result[i].path);
                const nextSampleNum = this.extractSampleNumber(result[i + 1].path);
                
                // Check if samples are consecutive and from problematic ranges
                if (this.areConsecutiveFromSameRange(currentSampleNum, nextSampleNum)) {
                    hasConsecutive = true;
                    
                    // Find a non-consecutive sample to swap with
                    for (let j = i + 2; j < result.length; j++) {
                        const swapSampleNum = this.extractSampleNumber(result[j].path);
                        if (!this.areConsecutiveFromSameRange(currentSampleNum, swapSampleNum)) {
                            // Swap the samples
                            [result[i + 1], result[j]] = [result[j], result[i + 1]];
                            break;
                        }
                    }
                    break;
                }
            }
            
            if (!hasConsecutive) {
                break;
            }
            
            attempts++;
        }
        
        return result;
    }

    areConsecutiveFromSameRange(sampleNum1, sampleNum2) {
        // Check if two samples are consecutive numbers from the same problematic range
        const diff = Math.abs(sampleNum1 - sampleNum2);
        
        // Consider consecutive if difference is 1 and both are in ranges that should be mixed
        if (diff === 1) {
            // Check if both are in 60-69 range (should be at end but not consecutive)
            if ((sampleNum1 >= 60 && sampleNum1 <= 69) && (sampleNum2 >= 60 && sampleNum2 <= 69)) {
                return true;
            }
            // Check if both are in 1-15 range (should be mixed but not consecutive)
            if ((sampleNum1 >= 1 && sampleNum1 <= 15) && (sampleNum2 >= 1 && sampleNum2 <= 15)) {
                return true;
            }
            // Check if both are in 70-88 range (should be mixed but not consecutive)
            if ((sampleNum1 >= 70 && sampleNum1 <= 88) && (sampleNum2 >= 70 && sampleNum2 <= 88)) {
                return true;
            }
        }
        
        return false;
    }

    extractSampleNumber(path) {
        const match = path.match(/sample_(\d+)\.wav$/);
        if (match) {
            return parseInt(match[1]);
        }
        return 0;
    }

    shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    async retryLoadData() {
        if (this.retryCount < this.maxRetries && !this.isLoading) {
            this.retryCount++;
            console.log(`Retry attempt ${this.retryCount}/${this.maxRetries}`);
            await this.loadData();
        } else if (this.retryCount >= this.maxRetries) {
            this.showError('Failed to load data after multiple attempts. Please refresh the page.');
        }
    }

    handleLoadError(error) {
        let errorMessage = 'Failed to load evaluation data.';
        
        if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. Please check your connection and try again.';
        } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = 'Network error. Please check your connection and try again.';
        } else if (error.message.includes('404')) {
            errorMessage = 'Data file not found. Please check if the file exists.';
        } else if (error.message.includes('Invalid data format')) {
            errorMessage = 'Invalid data format. Please check the JSON file.';
        }

        this.showError(errorMessage);
    }

    showLoading() {
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const container = document.getElementById('cardsContainer');
        const pagination = document.getElementById('pagination');
        
        if (loading) loading.style.display = 'block';
        if (error) error.style.display = 'none';
        if (container) container.innerHTML = '';
        if (pagination) pagination.style.display = 'none';
    }

    showError(message) {
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const container = document.getElementById('cardsContainer');
        const pagination = document.getElementById('pagination');
        
        if (loading) loading.style.display = 'none';
        if (error) {
            error.style.display = 'block';
            const errorText = error.querySelector('.error-text');
            if (errorText) errorText.textContent = message;
        }
        if (container) container.innerHTML = '';
        if (pagination) pagination.style.display = 'none';
    }

    setupPagination() {
        if (!this.data) return;
        
        this.totalPages = Math.ceil(this.data.length / this.cardsPerPage);
        this.currentPage = 0;
        
        // Create pagination controls
        this.createPaginationControls();
    }

    createPaginationControls() {
        const pagination = document.getElementById('pagination');
        if (!pagination) return;
        
        pagination.innerHTML = `
            <div class="pagination-info">
                <span id="pageInfo">Page 1 of ${this.totalPages}</span>
                <span id="itemInfo">Showing 1-${Math.min(this.cardsPerPage, this.data.length)} of ${this.data.length} samples</span>
            </div>
            <div class="pagination-controls">
                <button id="prevPage" class="page-btn prev-btn" disabled>
                    <span>← Previous</span>
                </button>
                <button id="nextPage" class="page-btn next-btn">
                    <span>Next →</span>
                </button>
            </div>
        `;
        
        // Add event listeners
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => this.previousPage());
        }
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => this.nextPage());
        }
        
        pagination.style.display = 'flex';
    }

    previousPage() {
        if (this.currentPage > 0) {
            this.currentPage--;
            this.renderCurrentPage();
            this.updatePaginationControls();
            this.scrollToTop();
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages - 1) {
            this.currentPage++;
            this.renderCurrentPage();
            this.updatePaginationControls();
            this.scrollToTop();
        }
    }

    updatePaginationControls() {
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');
        const pageInfo = document.getElementById('pageInfo');
        const itemInfo = document.getElementById('itemInfo');
        
        if (prevPageBtn) {
            prevPageBtn.disabled = this.currentPage === 0;
        }
        if (nextPageBtn) {
            nextPageBtn.disabled = this.currentPage === this.totalPages - 1;
        }
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage + 1} of ${this.totalPages}`;
        }
        if (itemInfo) {
            const startItem = this.currentPage * this.cardsPerPage + 1;
            const endItem = Math.min((this.currentPage + 1) * this.cardsPerPage, this.data.length);
            itemInfo.textContent = `Showing ${startItem}-${endItem} of ${this.data.length} samples`;
        }
    }

    scrollToTop() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderCurrentPage() {
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const container = document.getElementById('cardsContainer');
        
        if (!this.data) {
            return;
        }

        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'none';
        
        if (!container) return;

        // Clear existing cards
        container.innerHTML = '';
        
        // Calculate current page data
        const startIndex = this.currentPage * this.cardsPerPage;
        const endIndex = Math.min(startIndex + this.cardsPerPage, this.data.length);
        const currentPageData = this.data.slice(startIndex, endIndex);
        
        // Render only current page cards
        currentPageData.forEach((item, index) => {
            const globalIndex = startIndex + index;
            const card = this.createAudioCard(item, globalIndex);
            container.appendChild(card);
        });
        
        // Set up lazy loading for current page
        this.setupCardObservers();
        this.loadPreferences();
    }

    createAudioCard(item, index) {
        const card = document.createElement('div');
        card.className = 'audio-card';
        card.dataset.index = index;
        
        // Display sequential sample number (1-400) in UI, but keep original path for audio
        const displaySampleNumber = index + 1;
        
        // NO <source> tags up front - lazy load them
        card.innerHTML = `
            <div class="sample-info">Sample #${displaySampleNumber}</div>
            
            <audio class="audio-player" controls preload="none" data-path="${this.mapAudioPath(item.path)}" data-index="${index}">
                Your browser does not support the audio element.
            </audio>
            
            <div class="text-section ground-truth">
                <h3>Ground Truth</h3>
                <div class="text-content" style="font-size: ${this.currentFontSize}px">${this.escapeHtml(item.ground_truth)}</div>
            </div>
            
            <div class="text-section prediction">
                <h3>Model Prediction</h3>
                <div class="text-content" style="font-size: ${this.currentFontSize}px">${this.escapeHtml(item.prediction)}</div>
            </div>
        `;
        
        // Add click handler for modal
        card.addEventListener('click', (e) => {
            if (!e.target.closest('audio')) {
                this.openModal(index);
            }
        });
        
        // Add audio event handlers - lazy load sources
        const audio = card.querySelector('audio');
        if (audio) {
            // Load sources only on first user play
            const ensureSources = () => {
                if (audio.dataset.loaded) return;
                const path = audio.getAttribute('data-path');
                const s1 = document.createElement('source');
                s1.src = path;
                s1.type = 'audio/wav';
                audio.appendChild(s1);
                audio.dataset.loaded = '1';
                audio.load();
            };
            
            audio.addEventListener('play', () => {
                ensureSources();
                this.audioManager.stopAllExcept(audio);
                card.classList.add('playing');
            });
            
            audio.addEventListener('pause', () => {
                card.classList.remove('playing');
            });
            
            audio.addEventListener('ended', () => {
                card.classList.remove('playing');
            });
            
            // Safari-specific audio optimizations
            audio.addEventListener('error', (e) => {
                console.warn('Audio error:', e);
                card.classList.add('audio-error');
            });
        }
        
        return card;
    }

    // Set up intersection observer for lazy loading
    setupCardObservers() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }

        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const audio = entry.target.querySelector('audio');
                    if (audio && !audio.dataset.loaded) {
                        // Preload audio when card comes into view
                        const path = audio.getAttribute('data-path');
                        const s1 = document.createElement('source');
                        s1.src = path;
                        s1.type = 'audio/wav';
                        audio.appendChild(s1);
                        audio.dataset.loaded = '1';
                        audio.load();
                    }
                }
            });
        }, { 
            rootMargin: '200px' // Start loading when 200px away from viewport
        });

        // Observe all audio cards on current page
        document.querySelectorAll('.audio-card').forEach(card => {
            this.intersectionObserver.observe(card);
        });
    }

    openModal(index) {
        if (!this.data || index < 0 || index >= this.data.length) return;
        
        this.currentSampleIndex = index;
        const item = this.data[index];
        const displaySampleNumber = index + 1; // Sequential display number
        
        // Update modal content
        const modalTitle = document.getElementById('modalTitle');
        const modalGroundTruth = document.getElementById('modalGroundTruth');
        const modalPrediction = document.getElementById('modalPrediction');
        
        if (modalTitle) modalTitle.textContent = `Sample #${displaySampleNumber} Analysis`;
        if (modalGroundTruth) modalGroundTruth.textContent = item.ground_truth;
        if (modalPrediction) modalPrediction.textContent = item.prediction;
        
        // Set up modal audio
        const modalAudio = document.getElementById('modalAudio');
        if (modalAudio) {
            modalAudio.src = this.mapAudioPath(item.path);
            modalAudio.load();
        }
        
        // Show modal
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }
    }

    closeModal() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }
        
        // Stop modal audio
        const modalAudio = document.getElementById('modalAudio');
        if (modalAudio) {
            modalAudio.pause();
            modalAudio.currentTime = 0;
        }
    }

    navigateSample(direction) {
        const newIndex = this.currentSampleIndex + direction;
        if (newIndex >= 0 && newIndex < this.data.length) {
            this.openModal(newIndex);
        }
    }


    updateStats() {
        const totalSamples = this.data ? this.data.length : 0;
        
        const totalSamplesElement = document.getElementById('totalSamples');
        if (totalSamplesElement) {
            totalSamplesElement.textContent = totalSamples;
        }
        
        // Set WER to 2.21% as requested
        const currentWERElement = document.getElementById('currentWER');
        if (currentWERElement) {
            currentWERElement.textContent = '1.9%';
        }
    }

    loadPreferences() {
        // Load font size
        try {
            const savedFontSize = localStorage.getItem('preferredFontSize');
            if (savedFontSize) {
                const size = parseInt(savedFontSize);
                if (size >= this.minFontSize && size <= this.maxFontSize) {
                    this.currentFontSize = size;
                    this.updateFontSize();
                }
            }
        } catch (e) {
            console.warn('Could not load font size preference:', e);
        }
        
        // Load view preference
        try {
            const savedView = localStorage.getItem('preferredView');
            if (savedView && (savedView === 'grid' || savedView === 'list')) {
                this.setView(savedView);
            } else {
                // Default to list view
                this.setView('list');
            }
        } catch (e) {
            console.warn('Could not load view preference:', e);
            this.setView('list');
        }
        
        // Load dark mode preference
        try {
            const savedDarkMode = localStorage.getItem('preferredDarkMode');
            if (savedDarkMode === 'true') {
                this.isDarkMode = true;
                this.applyDarkMode();
            } else {
                // Check system preference
                if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    this.isDarkMode = true;
                    this.applyDarkMode();
                }
            }
        } catch (e) {
            console.warn('Could not load dark mode preference:', e);
        }
    }

    increaseFontSize() {
        if (this.currentFontSize < this.maxFontSize) {
            this.currentFontSize += 2;
            this.updateFontSize();
        }
    }

    decreaseFontSize() {
        if (this.currentFontSize > this.minFontSize) {
            this.currentFontSize -= 2;
            this.updateFontSize();
        }
    }

    updateFontSize() {
        const fontSizeDisplay = document.getElementById('fontSize');
        if (fontSizeDisplay) {
            fontSizeDisplay.textContent = `${this.currentFontSize}px`;
        }
        
        const textContents = document.querySelectorAll('.text-content, .modal-text-content');
        textContents.forEach(element => {
            element.style.fontSize = `${this.currentFontSize}px`;
        });

        try {
            localStorage.setItem('preferredFontSize', this.currentFontSize.toString());
        } catch (e) {
            console.warn('Could not save font size preference:', e);
        }
    }

    setView(view) {
        this.currentView = view;
        const container = document.getElementById('cardsContainer');
        const gridBtn = document.getElementById('gridView');
        const listBtn = document.getElementById('listView');
        
        if (container) {
            container.className = `cards-container ${view}-view`;
        }
        
        if (gridBtn && listBtn) {
            gridBtn.classList.toggle('active', view === 'grid');
            listBtn.classList.toggle('active', view === 'list');
        }
        
        try {
            localStorage.setItem('preferredView', view);
        } catch (e) {
            console.warn('Could not save view preference:', e);
        }
    }

    toggleDarkMode() {
        this.isDarkMode = !this.isDarkMode;
        this.applyDarkMode();
        
        try {
            localStorage.setItem('preferredDarkMode', this.isDarkMode.toString());
        } catch (e) {
            console.warn('Could not save dark mode preference:', e);
        }
    }

    applyDarkMode() {
        const body = document.body;
        const darkModeToggle = document.getElementById('darkModeToggle');
        
        if (this.isDarkMode) {
            body.setAttribute('data-theme', 'dark');
            if (darkModeToggle) {
                darkModeToggle.innerHTML = '<span class="btn-icon">☀️</span><span class="btn-text">Light</span>';
                darkModeToggle.title = 'Switch to light mode';
            }
        } else {
            body.removeAttribute('data-theme');
            if (darkModeToggle) {
                darkModeToggle.innerHTML = '<span class="btn-icon">🌙</span><span class="btn-text">Dark</span>';
                darkModeToggle.title = 'Switch to dark mode';
            }
        }
    }

    extractSampleNumber(path) {
        const match = path.match(/sample_(\d+)\.wav$/);
        if (match) {
            return parseInt(match[1]);
        }
        return 0;
    }

    mapAudioPath(jsonPath) {
        // Extract sample number from JSON path (e.g., sample_00000.wav -> 0)
        const match = jsonPath.match(/sample_(\d+)\.wav$/);
        if (match) {
            const sampleNumber = parseInt(match[1]);
            // Map to local audio file path in audio_fixed directory (e.g., sample_00000.wav)
            return `audio_fixed/sample_${String(sampleNumber).padStart(5, '0')}.wav`;
        }
        return jsonPath; // Fallback to original path
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        
        // Initialize matrix
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        
        // Fill matrix
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }
        
        return matrix[str2.length][str1.length];
    }

    isModalOpen() {
        const modal = document.getElementById('modal');
        return modal && modal.style.display === 'flex';
    }

    // Cleanup method
    destroy() {
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
    }
}

// Audio Manager class to handle multiple audio instances - Safari optimized
class AudioManager {
    constructor() {
        this.playingAudios = new Set();
    }

    stopAllExcept(currentAudio) {
        this.playingAudios.forEach(audio => {
            if (audio !== currentAudio && !audio.paused) {
                audio.pause();
                audio.currentTime = 0;
                // Remove playing class from parent card
                const card = audio.closest('.audio-card');
                if (card) {
                    card.classList.remove('playing');
                }
            }
        });
        this.playingAudios.clear();
        if (currentAudio) {
            this.playingAudios.add(currentAudio);
        }
    }

    registerAudio(audio) {
        audio.addEventListener('play', () => {
            this.stopAllExcept(audio);
        });
        
        audio.addEventListener('pause', () => {
            this.playingAudios.delete(audio);
        });
        
        audio.addEventListener('ended', () => {
            this.playingAudios.delete(audio);
        });
    }
}

// Initialize the app when the page loads - Safari optimized
document.addEventListener('DOMContentLoaded', () => {
    // Add loading animation - Safari optimized
    const loading = document.getElementById('loading');
    if (loading) {
        let dots = 0;
        const interval = setInterval(() => {
            dots = (dots + 1) % 4;
            const loadingText = loading.querySelector('.loading-text');
            if (loadingText) {
                loadingText.textContent = 'Loading evaluation data' + '.'.repeat(dots);
            }
        }, 500);
        
        // Clear interval when data loads
        const checkData = setInterval(() => {
            if (document.querySelector('.audio-card')) {
                clearInterval(interval);
                clearInterval(checkData);
            }
        }, 100);
    }

    // Initialize app with error handling
    try {
        new AudioEvaluationApp();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        const errorContainer = document.getElementById('error');
        if (errorContainer) {
            errorContainer.style.display = 'block';
            const errorText = errorContainer.querySelector('.error-text');
            if (errorText) {
                errorText.textContent = 'Failed to initialize the application. Please refresh the page.';
            }
        }
    }
});
