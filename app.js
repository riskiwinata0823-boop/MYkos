        const API_BASE = "";
        const LISTINGS = [
            {
                id: "qohhar", title: "Kos Putra Pak Qohhar (VIP)", price: 650000, area: "Rajabasa, dekat Polinela",
                distance: "5 menit jalan kaki ke Polinela", description: "Kamar nyaman dengan Wi-Fi, kasur, dan lemari. Cocok untuk mahasiswa yang ingin dekat kampus.",
                facilities: ["Kamar Mandi Dalam", "WiFi", "Kasur", "Lemari"], gender: "Putra",
                image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=900&q=82"
            },
            {
                id: "razzi", title: "Kos Razzi Eksklusif", price: 500000, area: "Rajabasa, Bandar Lampung",
                distance: "Sekitar 8 menit ke Polinela", description: "Pilihan ekonomis dengan akses 24 jam, listrik dan air termasuk, serta parkir luas.",
                facilities: ["Parkir", "Dapur Umum", "Listrik & air"], gender: "Campur",
                image: "https://images.unsplash.com/photo-1502672260266-1c1e52409818?auto=format&fit=crop&w=900&q=82"
            },
            {
                id: "winata", title: "Paviliun Winata", price: 800000, area: "Kedaton, Bandar Lampung",
                distance: "Sekitar 12 menit ke Polinela", description: "Kamar dengan pendingin udara dan layanan laundry, tidak jauh dari area perbelanjaan.",
                facilities: ["AC", "Laundry", "WiFi"], gender: "Campur",
                image: "https://images.unsplash.com/photo-1554995207-c18c203602cb?auto=format&fit=crop&w=900&q=82"
            },
            {
                id: "melati", title: "Kos Melati Rajabasa", price: 575000, area: "Rajabasa, Bandar Lampung",
                distance: "Sekitar 7 menit ke Polinela", description: "Kamar sederhana di area Rajabasa dengan Wi-Fi dan area parkir motor.",
                facilities: ["WiFi", "Parkir", "Dapur Umum"], gender: "Putri",
                image: "https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=900&q=82"
            },
            {
                id: "nusa", title: "Kos Nusa Indah", price: 950000, area: "Kedaton, Bandar Lampung",
                distance: "Sekitar 10 menit ke Polinela", description: "Kamar berfurnitur dengan kamar mandi dalam dan area bersama yang nyaman.",
                facilities: ["Kamar Mandi Dalam", "AC", "Kasur", "Lemari"], gender: "Putri",
                image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=82"
            },
            {
                id: "sakura", title: "Kos Sakura Mahasiswa", price: 700000, area: "Rajabasa, Bandar Lampung",
                distance: "Sekitar 6 menit ke Polinela", description: "Hunian mahasiswa dengan Wi-Fi, dapur bersama, dan akses mudah ke area kampus.",
                facilities: ["WiFi", "Parkir", "Dapur Umum"], gender: "Campur",
                image: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=82"
            }
        ];
        const CHAT_STORAGE = "mykos_chat_history";
        const FAVORITE_STORAGE = "mykos_favorites";
        let favorites = loadArray(FAVORITE_STORAGE);
        let chatHistory = loadArray(CHAT_STORAGE);
        let selectedFacility = "";
        let showFavoritesOnly = false;
        let chatBusy = false;
        let authToken = null;
        let authUser = null;
        let toastTimer;
        const $ = (id) => document.getElementById(id);
        const rupiah = (amount) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(amount);

        function loadArray(key) {
            try {
                const value = JSON.parse(localStorage.getItem(key) || "[]");
                if (!Array.isArray(value)) throw new Error("Format data tidak sesuai.");
                return value;
            } catch (error) {
                console.error(`Data ${key} tidak dapat dibaca:`, error);
                return [];
            }
        }
        function notify(message) {
            const toast = $("toast");
            toast.textContent = message;
            toast.classList.add("show");
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
        }
        async function apiRequest(path, { method = "GET", body } = {}) {
            const headers = {};
            if (body !== undefined) headers["Content-Type"] = "application/json";
            if (authToken) headers.Authorization = `Bearer ${authToken}`;
            let response;
            try {
                response = await fetch(`${API_BASE}${path}`, {
                    method,
                    headers,
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
            } catch (error) {
                throw new Error("Server MYkos tidak terjangkau. Jalankan start_mykos.bat lalu buka http://127.0.0.1:3100.");
            }
            const data = await response.json().catch(() => null);
            if (!response.ok) {
                const error = new Error(data?.error?.message || `Permintaan gagal (HTTP ${response.status}).`);
                error.status = response.status;
                error.code = data?.error?.code;
                throw error;
            }
            return data;
        }
        function renderListings() {
            const query = $("search-input").value.trim().toLocaleLowerCase("id");
            const maxPrice = $("price-filter").value;
            const visible = LISTINGS.filter((listing) => {
                const searchable = `${listing.title} ${listing.area} ${listing.description} ${listing.facilities.join(" ")} ${listing.gender}`.toLocaleLowerCase("id");
                return (!query || searchable.includes(query))
                    && (maxPrice === "all" || listing.price <= Number(maxPrice))
                    && (!selectedFacility || listing.facilities.some((facility) => facility.toLocaleLowerCase("id").includes(selectedFacility.toLocaleLowerCase("id"))))
                    && (!showFavoritesOnly || favorites.includes(listing.id));
            });
            $("result-count").textContent = `Menampilkan ${visible.length} dari ${LISTINGS.length} kos · Data contoh`;
            const grid = $("kos-grid");
            grid.replaceChildren();
            if (!visible.length) {
                const empty = document.createElement("div");
                empty.className = "empty-results";
                empty.innerHTML = "<strong>Kos belum ditemukan</strong>Coba ubah kata pencarian atau filter yang dipilih.";
                grid.appendChild(empty);
                return;
            }
            visible.forEach((listing) => {
                const card = document.createElement("article");
                card.className = "kos-card";
                const photoWrap = document.createElement("div");
                photoWrap.className = "kos-photo-wrap";
                const image = document.createElement("img");
                image.className = "kos-img";
                image.src = listing.image;
                image.alt = `Kamar kos ${listing.title}`;
                image.loading = "lazy";
                image.onerror = () => { image.hidden = true; };
                const badge = document.createElement("span");
                badge.className = "badge-verified";
                badge.textContent = "✦ Rekomendasi";
                const favorite = document.createElement("button");
                favorite.className = `favorite-btn${favorites.includes(listing.id) ? " active" : ""}`;
                favorite.type = "button";
                favorite.setAttribute("aria-label", favorites.includes(listing.id) ? "Hapus dari favorit" : "Simpan ke favorit");
                favorite.setAttribute("aria-pressed", String(favorites.includes(listing.id)));
                favorite.textContent = favorites.includes(listing.id) ? "♥" : "♡";
                favorite.addEventListener("click", () => toggleFavorite(listing.id));
                photoWrap.append(image, badge, favorite);
                const info = document.createElement("div");
                info.className = "kos-info";
                const price = document.createElement("div");
                price.className = "kos-price";
                price.textContent = rupiah(listing.price);
                const monthly = document.createElement("small");
                monthly.textContent = " / bulan";
                price.appendChild(monthly);
                const title = document.createElement("div");
                title.className = "kos-title";
                title.textContent = listing.title;
                const location = document.createElement("div");
                location.className = "kos-location";
                location.textContent = `⌖ ${listing.area} · ${listing.distance}`;
                const description = document.createElement("p");
                description.className = "kos-desc";
                description.textContent = listing.description;
                const tags = document.createElement("div");
                tags.className = "kos-tags";
                listing.facilities.slice(0, 3).forEach((facility) => {
                    const tag = document.createElement("span");
                    tag.textContent = facility;
                    tags.appendChild(tag);
                });
                const actions = document.createElement("div");
                actions.className = "card-actions";
                const detail = document.createElement("button");
                detail.type = "button";
                detail.className = "detail-btn";
                detail.textContent = "Lihat detail";
                detail.addEventListener("click", () => openDetail(listing.id));
                const ask = document.createElement("button");
                ask.type = "button";
                ask.className = "ask-btn";
                ask.textContent = "Tanya AI";
                ask.addEventListener("click", () => {
                    openChat(`Ceritakan detail ${listing.title} dan fasilitasnya.`);
                });
                actions.append(detail, ask);
                info.append(price, title, location, description, tags, actions);
                card.append(photoWrap, info);
                grid.appendChild(card);
            });
        }
        function toggleFavorite(id) {
            favorites = favorites.includes(id) ? favorites.filter((item) => item !== id) : [...favorites, id];
            try { localStorage.setItem(FAVORITE_STORAGE, JSON.stringify(favorites)); }
            catch (error) { console.error("Gagal menyimpan favorit:", error); notify("Favorit tidak dapat disimpan di browser ini."); }
            renderListings();
        }
        function openModal(id) {
            $(id).classList.add("show");
            document.body.style.overflow = "hidden";
        }
        function closeModal(modal) {
            modal.classList.remove("show");
            if (!document.querySelector(".modal-backdrop.show")) document.body.style.overflow = "";
        }
        function openDetail(id) {
            const listing = LISTINGS.find((item) => item.id === id);
            if (!listing) return;
            const content = $("detail-content");
            content.replaceChildren();
            const image = document.createElement("img");
            image.className = "detail-image";
            image.src = listing.image;
            image.alt = `Foto kamar ${listing.title}`;
            const details = document.createElement("div");
            details.className = "detail-content";
            const price = document.createElement("div");
            price.className = "detail-price";
            price.textContent = `${rupiah(listing.price)} / bulan`;
            const title = document.createElement("h2");
            title.textContent = listing.title;
            const location = document.createElement("p");
            location.textContent = `⌖ ${listing.area} · ${listing.distance} · Kos ${listing.gender}`;
            const description = document.createElement("p");
            description.textContent = listing.description;
            const facilities = document.createElement("div");
            facilities.className = "detail-facilities";
            listing.facilities.forEach((facility) => {
                const tag = document.createElement("span");
                tag.textContent = facility;
                facilities.appendChild(tag);
            });
            const note = document.createElement("p");
            note.textContent = "Data di halaman ini merupakan contoh. Konfirmasi harga, ketersediaan, dan fasilitas langsung kepada pemilik sebelum menyewa.";
            const ask = document.createElement("button");
            ask.className = "primary-btn";
            ask.type = "button";
            ask.textContent = "Tanya asisten tentang kos ini";
            ask.addEventListener("click", () => {
                closeModal($("detail-modal"));
                openChat(`Apakah ${listing.title} cocok untuk saya? Harganya ${rupiah(listing.price)} per bulan, lokasinya ${listing.area}, dan fasilitasnya ${listing.facilities.join(", ")}.`);
            });
            details.append(price, title, location, description, facilities, note, ask);
            content.append(image, details);
            openModal("detail-modal");
        }
        function renderChatHistory() {
            $("chat-body").querySelectorAll(".chat-msg").forEach((message) => message.remove());
            chatHistory.forEach((message) => addChatMessage(message.role === "user" ? "user" : "bot", message.content));
        }
        function addChatMessage(role, text, loading = false) {
            const message = document.createElement("div");
            message.className = `chat-msg ${role}${loading ? " loading" : ""}`;
            message.textContent = text;
            $("chat-body").appendChild(message);
            $("chat-body").scrollTop = $("chat-body").scrollHeight;
            return message;
        }
        function openChat(prefill = "") {
            $("chat-window").classList.add("open");
            $("chat-toggle").setAttribute("aria-expanded", "true");
            if (prefill) {
                $("chat-input").value = prefill;
                $("chat-form").requestSubmit();
            } else {
                $("chat-input").focus();
            }
        }
        function closeChat() {
            $("chat-window").classList.remove("open");
            $("chat-toggle").setAttribute("aria-expanded", "false");
        }
        async function sendChat(event) {
            if (event) event.preventDefault();
            const input = $("chat-input");
            const question = input.value.trim();
            if (!question || chatBusy) return;
            if (!authToken) {
                openLogin();
                return;
            }
            input.value = "";
            $("chat-body").querySelector(".chat-suggestions")?.remove();
            chatHistory.push({ role: "user", content: question });
            addChatMessage("user", question);
            $("chat-send").disabled = true;
            chatBusy = true;
            const loading = addChatMessage("bot", "Mencari pilihan yang cocok…", true);
            try {
                const previousMessages = chatHistory.slice(-3, -1).map((message) =>
                    `${message.role === "user" ? "Pengguna" : "Asisten"}: ${message.content.slice(0, 60)}`
                ).join("\n");
                const catalog = LISTINGS.map((listing) =>
                    `${listing.title} ${Math.round(listing.price / 1000)}rb ${listing.area.split(",")[0]} ${listing.facilities.slice(0, 2).join("/")}`
                ).join("; ");
                const prompt = `Konteks aplikasi MYkos (data contoh): ${catalog}\n${previousMessages ? `Percakapan sebelumnya: ${previousMessages}\n` : ""}Pertanyaan pengguna: ${question.slice(0, 240)}. Jawab bahasa Indonesia, rekomendasikan hanya dari data ini dan ingatkan untuk verifikasi ke pemilik.`;
                const data = await apiRequest("/api/chat", { method: "POST", body: { question: prompt } });
                const answer = data?.answer;
                if (typeof answer !== "string" || !answer.trim()) throw new Error("Respons AI kosong atau formatnya tidak dikenal.");
                loading.remove();
                chatHistory.push({ role: "assistant", content: answer });
                addChatMessage("bot", answer);
                $("chat-status").textContent = `AI aktif · ${authUser.nama}`;
                $("chat-footnote").textContent = "Harga dan fasilitas perlu dikonfirmasi kepada pemilik.";
                try { localStorage.setItem(CHAT_STORAGE, JSON.stringify(chatHistory.slice(-40))); }
                catch (storageError) { console.error("Riwayat chat tidak dapat disimpan:", storageError); }
            } catch (error) {
                loading.remove();
                console.error("Permintaan asisten MYkos gagal:", error);
                if (error.status === 401) {
                    clearAuthentication();
                    openLogin();
                    input.value = question;
                    notify("Sesi token berakhir. Silakan masuk kembali.");
                } else if (error.status === 403) {
                    addChatMessage("bot", "Akun ini belum memiliki hak akses chat. Silakan keluar dan masuk dengan akun praktikum yang memiliki hak chat.");
                    notify("Akun tidak memiliki izin untuk menggunakan chat (403).");
                } else {
                    addChatMessage("bot", `Maaf, asisten MYkos tidak dapat menjawab: ${error.message}`);
                    $("chat-status").textContent = "Layanan AI bermasalah";
                    notify(error.message);
                }
            } finally {
                chatBusy = false;
                $("chat-send").disabled = false;
                input.focus();
            }
        }
        function updateAuthStatus() {
            const signedIn = Boolean(authToken && authUser);
            $("chat-status").textContent = signedIn ? `AI aktif · ${authUser.nama}` : "Masuk untuk mulai chat AI";
            $("chat-footnote").textContent = signedIn
                ? `Akun ${authUser.peran} · hak: ${authUser.scopes.join(", ") || "tidak ada"}`
                : "Gunakan akun praktikum P10; token berlaku sementara.";
            $("login-link").textContent = signedIn ? `Keluar (${authUser.nama})` : "Masuk";
            $("login-link").setAttribute("aria-label", signedIn ? `Keluar dari akun ${authUser.nama}` : "Masuk ke MYkos");
            $("auth-action").setAttribute("aria-label", signedIn ? "Keluar dari MYkos" : "Masuk ke MYkos");
            $("auth-action").title = signedIn ? "Keluar" : "Masuk";
            $("auth-action").textContent = signedIn ? "↪" : "↗";
        }
        function clearAuthentication() {
            authToken = null;
            authUser = null;
            updateAuthStatus();
        }
        function openLogin() {
            $("login-error").textContent = "";
            $("login-error").classList.remove("show");
            openModal("login-modal");
            $("login-name").focus();
        }
        async function login(event) {
            event.preventDefault();
            const button = $("login-submit");
            const errorMessage = $("login-error");
            errorMessage.textContent = "";
            errorMessage.classList.remove("show");
            button.disabled = true;
            try {
                const credentials = {
                    nama: $("login-name").value.trim(),
                    sandi: $("login-password").value
                };
                const result = await apiRequest("/api/masuk", { method: "POST", body: credentials });
                if (typeof result?.token !== "string" || !result.token) throw new Error("Server tidak mengembalikan token akses.");
                authToken = result.token;
                authUser = await apiRequest("/api/saya");
                if (!Array.isArray(authUser.scopes)) throw new Error("Informasi hak akses tidak valid.");
                $("login-password").value = "";
                closeModal($("login-modal"));
                updateAuthStatus();
                notify(`Berhasil masuk sebagai ${authUser.nama}. Token disimpan di memori halaman.`);
                if (authUser.scopes.includes("chat") && $("chat-input").value.trim()) $("chat-form").requestSubmit();
            } catch (error) {
                clearAuthentication();
                errorMessage.textContent = error.message;
                errorMessage.classList.add("show");
            } finally {
                button.disabled = false;
            }
        }
        function logout() {
            clearAuthentication();
            $("login-password").value = "";
            notify("Anda sudah keluar. Token dihapus dari halaman.");
        }

        $("search-form").addEventListener("submit", (event) => {
            event.preventDefault();
            renderListings();
            $("cari-kos").scrollIntoView({ behavior: "smooth" });
        });
        $("search-input").addEventListener("input", renderListings);
        $("price-filter").addEventListener("change", renderListings);
        document.querySelectorAll("[data-facility]").forEach((button) => button.addEventListener("click", () => {
            selectedFacility = selectedFacility === button.dataset.facility ? "" : button.dataset.facility;
            document.querySelectorAll("[data-facility]").forEach((chip) => chip.classList.toggle("selected", chip.dataset.facility === selectedFacility));
            renderListings();
        }));
        $("favorites-filter").addEventListener("click", () => {
            showFavoritesOnly = !showFavoritesOnly;
            $("favorites-filter").classList.toggle("selected", showFavoritesOnly);
            $("favorites-filter").setAttribute("aria-pressed", String(showFavoritesOnly));
            renderListings();
        });
        $("chat-toggle").addEventListener("click", () => $("chat-window").classList.contains("open") ? closeChat() : openChat());
        $("chat-close").addEventListener("click", closeChat);
        $("promo-chat").addEventListener("click", () => openChat("Bantu aku memilih kos sesuai budget dan fasilitas yang aku butuhkan."));
        $("chat-form").addEventListener("submit", sendChat);
        document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
            $("chat-input").value = button.dataset.question;
            $("chat-form").requestSubmit();
        }));
        $("login-form").addEventListener("submit", login);
        $("auth-action").addEventListener("click", () => authToken ? logout() : openLogin());
        document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => closeModal(button.closest(".modal-backdrop"))));
        document.querySelectorAll(".modal-backdrop").forEach((backdrop) => backdrop.addEventListener("click", (event) => {
            if (event.target === backdrop) closeModal(backdrop);
        }));
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape") document.querySelectorAll(".modal-backdrop.show").forEach(closeModal);
        });
        $("login-link").addEventListener("click", (event) => {
            event.preventDefault();
            if (authToken) logout();
            else openLogin();
        });
        $("menu-button").addEventListener("click", () => {
            const open = $("nav-links").classList.toggle("open");
            $("menu-button").setAttribute("aria-expanded", String(open));
        });
        $("nav-links").querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
            $("nav-links").classList.remove("open");
            $("menu-button").setAttribute("aria-expanded", "false");
        }));

        renderListings();
        renderChatHistory();
        updateAuthStatus();
