document.addEventListener('DOMContentLoaded', () => {
    // --- Gamification & Utils ---
    const quotes = [
        { q: "The secret of getting ahead is getting started.", a: "Mark Twain" },
        { q: "It always seems impossible until it's done.", a: "Nelson Mandela" },
        { q: "Don't watch the clock; do what it does. Keep going.", a: "Sam Levenson" },
        { q: "Quality is not an act, it is a habit.", a: "Aristotle" },
        { q: "The only way to do great work is to love what you do.", a: "Steve Jobs" },
        { q: "Great things are not done by impulse, but by a series of small things brought together.", a: "Vincent Van Gogh" }
    ];
    let audioCtx;
    function playSound(type) {
        try {
            if(!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const t = audioCtx.currentTime;

            if(type === 'celebrate') {
                const freqs = [523.25, 659.25, 783.99, 1046.50];
                freqs.forEach((freq, idx) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = 'sine';
                    osc.frequency.value = freq;
                    const startTime = t + (idx * 0.1);
                    gain.gain.setValueAtTime(0, startTime);
                    gain.gain.linearRampToValueAtTime(0.6, startTime + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    osc.start(startTime);
                    osc.stop(startTime + 0.3);
                });
            } else if(type === 'late') {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(300, t);
                osc.frequency.exponentialRampToValueAtTime(120, t + 0.5);
                gain.gain.setValueAtTime(1.0, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.5);
            } else {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, t);
                osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
                gain.gain.setValueAtTime(1.0, t); 
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.15);
            }
        } catch(e) {}
    }
    function triggerConfetti(x, y) {
        if(typeof confetti === 'function') {
            confetti({ particleCount: 70, spread: 70, origin: { x, y }, colors: ['#a78bfa', '#3b82f6', '#10b981', '#f59e0b', '#f28482'] });
        }
    }
    function getNormalizedCoordinates(el) {
        const rect = el.getBoundingClientRect();
        return { x: (rect.left + (rect.width/2)) / window.innerWidth, y: (rect.top + (rect.height/2)) / window.innerHeight };
    }

    // --- Backend Email Communicators ---
    async function scheduleEmailBackend(id, title, type, date, time, val, unit, targetEmail = currentUser) {
        if(!targetEmail || !date || !time) return;
        try {
            await fetch('http://localhost:3000/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id, title, type, date, time, 
                    email: targetEmail, 
                    offsetValue: val,
                    offsetUnit: unit
                })
            });
            console.log(`[Email] Scheduled server reminder for ${title} to ${targetEmail}`);
        } catch(e) {
            console.warn("Backend server (server.js) is not running to process emails.");
        }
    }

    async function cancelEmailBackend(id) {
        try {
            await fetch('http://localhost:3000/api/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            });
        } catch(e) {}
    }

    // --- Core State Variables ---
    let tasks = [];
    let events = []; 
    let currentMode = 'personal'; 
    let currentTheme = localStorage.getItem('taskflow_theme') || 'default';
    let currentView = 'dashboard';
    let tempSubtasks = []; 
    let editingTaskId = null;
    let editingEventId = null;
    let currentCalMonth = new Date().getMonth();
    let currentCalYear = new Date().getFullYear();
    let teamName = null;
    let teamMembers = [];

    // --- Auth State ---
    let currentUser = localStorage.getItem('taskflow_current_user');
    let usersDb = JSON.parse(localStorage.getItem('taskflow_users')) || [];

    // --- DOM Elements ---
    const htmlEl = document.documentElement;
    const btnPersonal = document.getElementById('btn-personal');
    const btnProfessional = document.getElementById('btn-professional');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-section');
    const viewTitle = document.getElementById('view-title');
    const currentDateEl = document.getElementById('current-date');
    
    const btnAddTask = document.getElementById('btn-add-task');
    const modal = document.getElementById('task-modal');
    const eventModal = document.getElementById('event-modal');
    const closeModals = document.querySelectorAll('.close-modal');
    
    const taskForm = document.getElementById('task-form');
    const eventForm = document.getElementById('event-form');
    const subtaskInput = document.getElementById('new-subtask-input');
    const btnAddSubtask = document.getElementById('btn-add-subtask');
    const checklistContainer = document.getElementById('checklist-container');
    const searchTask = document.getElementById('search-task');
    const filterStatus = document.getElementById('filter-status');

    const authView = document.getElementById('auth-view');
    const appContainer = document.getElementById('app-container');

    // --- Bootstrapper ---
    setupAuthListeners();
    setupEventListeners(); 
    
    if(currentUser) {
        logIn(currentUser, true);
    } else {
        authView.style.display = 'flex';
        appContainer.style.display = 'none';
        setTheme(currentTheme); 
    }

    setInterval(checkReminders, 60000); 

    function init() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        currentDateEl.textContent = new Date().toLocaleDateString('en-US', options);
        
        const ranQuote = quotes[Math.floor(Math.random() * quotes.length)];
        document.getElementById('daily-quote').textContent = `"${ranQuote.q}"`;
        document.getElementById('quote-author').textContent = `- ${ranQuote.a}`;
        
        setMode('personal'); 
        setTheme(currentTheme);
    }

    // --- Authentication Logic ---
    function setupAuthListeners() {
        const toSignup = document.getElementById('to-signup');
        const toLogin = document.getElementById('to-login');
        const loginForm = document.getElementById('login-form');
        const signupForm = document.getElementById('signup-form');
        const loginError = document.getElementById('login-error');
        const signupError = document.getElementById('signup-error');

        toSignup.addEventListener('click', () => {
             loginForm.classList.remove('active');
             signupForm.classList.add('active');
             loginError.style.display = 'none';
             signupError.style.display = 'none';
        });
        
        toLogin.addEventListener('click', () => {
             signupForm.classList.remove('active');
             loginForm.classList.add('active');
             loginError.style.display = 'none';
             signupError.style.display = 'none';
        });

        signupForm.addEventListener('submit', (e) => {
             e.preventDefault();
             usersDb = JSON.parse(localStorage.getItem('taskflow_users')) || [];
             const email = document.getElementById('signup-email').value.trim().toLowerCase();
             const pwd = document.getElementById('signup-password').value;
             if(usersDb.find(u => u.email === email)) {
                 signupError.textContent = "Account already exists with this email!";
                 signupError.style.display = 'block';
                 return;
             }
             usersDb.push({ email, password: pwd });
             localStorage.setItem('taskflow_users', JSON.stringify(usersDb));
             signupError.style.display = 'none';
             logIn(email, false);
        });

        loginForm.addEventListener('submit', (e) => {
             e.preventDefault();
             usersDb = JSON.parse(localStorage.getItem('taskflow_users')) || [];
             const email = document.getElementById('login-email').value.trim().toLowerCase();
             const pwd = document.getElementById('login-password').value;
             const user = usersDb.find(u => u.email === email && u.password === pwd);
             if(!user) {
                 loginError.textContent = "Invalid email or password!";
                 loginError.style.display = 'block';
                 return;
             }
             loginError.style.display = 'none';
             logIn(email, false);
        });

        document.getElementById('btn-logout').addEventListener('click', () => {
             localStorage.removeItem('taskflow_current_user');
             currentUser = null;
             document.getElementById('login-form').reset();
             document.getElementById('signup-form').reset();
             document.getElementById('login-email').value = '';
             document.getElementById('login-password').value = '';
             appContainer.style.display = 'none';
             authView.style.display = 'flex';
        });

        document.querySelectorAll('.toggle-pwd').forEach(icon => {
             icon.addEventListener('click', (e) => {
                 const targetId = e.currentTarget.getAttribute('data-target');
                 const inputEl = document.getElementById(targetId);
                 if(inputEl.type === 'password') {
                     inputEl.type = 'text';
                     e.currentTarget.classList.replace('fa-eye', 'fa-eye-slash');
                 } else {
                     inputEl.type = 'password';
                     e.currentTarget.classList.replace('fa-eye-slash', 'fa-eye');
                 }
             });
        });
    }

    function logIn(email, isInitialLoad) {
        currentUser = email;
        localStorage.setItem('taskflow_current_user', email);
        authView.style.display = 'none';
        appContainer.style.display = 'flex';
        
        loadTasks();
        loadEvents();
        loadTeam();
        init(); 
        if(isInitialLoad === false) {
           showToast(`Welcome, ${email.split('@')[0]}!`);
        }
    }

    function loadTasks() {
        if(!currentUser) return;
        let globalTasks = JSON.parse(localStorage.getItem('taskflow_global_tasks'));
        if(!globalTasks) {
            globalTasks = [];
            usersDb.forEach(u => {
                let uTasks = JSON.parse(localStorage.getItem(`taskflow_tasks_${u.email}`));
                if(uTasks) {
                    uTasks.forEach(t => { 
                        if(!t.owner) t.owner = u.email; 
                        globalTasks.push(t); 
                    });
                }
            });
            if(globalTasks.length === 0) {
                globalTasks = [
                    { id: Date.now().toString(), title: `Welcome to TaskFlow!`, description: 'This is your secure, personal workspace.', dueDate: getTodayStr(), dueTime: '15:30', category: 'personal', completed: false, subtasks: [], owner: currentUser }
                ];
            }
            localStorage.setItem('taskflow_global_tasks', JSON.stringify(globalTasks));
        }
        tasks = globalTasks;
    }

    function saveTasks() {
        if(!currentUser) return;
        localStorage.setItem('taskflow_global_tasks', JSON.stringify(tasks));
    }

    function loadEvents() {
        if(!currentUser) return;
        events = JSON.parse(localStorage.getItem('taskflow_global_events')) || [];
    }

    function saveEvents() {
        if(!currentUser) return;
        localStorage.setItem('taskflow_global_events', JSON.stringify(events));
    }

    function getVisibleTasks() {
        if(!currentUser) return [];
        if(currentMode === 'personal') {
            return tasks.filter(t => t.category === 'personal' && t.owner === currentUser);
        } else {
            return tasks.filter(t => t.category === 'professional' && (t.owner === currentUser || t.assignee === currentUser));
        }
    }

    // --- Team Logic ---
    function loadTeam() {
        if(!currentUser) return;
        teamName = localStorage.getItem(`taskflow_team_name_${currentUser}`) || null;
        teamMembers = JSON.parse(localStorage.getItem(`taskflow_team_members_${currentUser}`)) || [];
    }

    function saveTeam() {
        if(!currentUser) return;
        if(teamName) localStorage.setItem(`taskflow_team_name_${currentUser}`, teamName);
        localStorage.setItem(`taskflow_team_members_${currentUser}`, JSON.stringify(teamMembers));
    }

    window.createTeam = function() {
        const name = prompt("Enter your new Team name:");
        if(name) {
            teamName = name;
            saveTeam();
            renderTeamView();
            showToast("Team Created!");
        }
    };

    window.addTeamMember = function() {
        usersDb = JSON.parse(localStorage.getItem('taskflow_users')) || [];
        const emailPrompt = prompt("Enter team member's registered email address:");
        if(emailPrompt) {
            const email = emailPrompt.trim().toLowerCase();
            if(!email) return;
            if(email === currentUser) return alert("Action Denied: You cannot add yourself to the team.");
            if(teamMembers.includes(email)) return alert("This member is already in your team.");
            
            const exists = usersDb.find(u => u.email === email);
            if(!exists) return alert(`Security Failure:\n\nThe user account "${email}" does not exist in the TaskFlow system. They must sign up for an account before you can securely collaborate with them.`);
            
            teamMembers.push(email);
            saveTeam();
            renderTeamView();
            showToast("Member successfully verified and added!");
        }
    };

    window.removeTeamMember = function(idx) {
        if(confirm("Remove this member?")) {
            teamMembers.splice(idx, 1);
            saveTeam();
            renderTeamView();
            showToast("Member Removed!");
        }
    };

    function renderTeamView() {
        const tContent = document.getElementById('team-content');
        if(!tContent) return;

        if(!teamName) {
            tContent.innerHTML = `
                <div style="text-align:center; padding: 40px;">
                    <div style="font-size: 3rem; color:var(--primary-color); margin-bottom: 20px;"><i class="fa-solid fa-people-group"></i></div>
                    <h2 style="font-size:1.8rem">You haven't built a team yet.</h2>
                    <p style="color:var(--text-muted); margin: 15px 0 30px;">Create your central hub to collaborate and securely assign tasks to registered colleagues.</p>
                    <button class="btn-primary" style="margin: 0 auto;" onclick="createTeam()"><i class="fa-solid fa-plus"></i> Create Team</button>
                </div>
            `;
            return;
        }

        tContent.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 20px;">
                <h2 style="font-size: 1.8rem;"><i class="fa-solid fa-people-group" style="color:var(--primary-color)"></i> <span style="margin-left:8px;">${teamName}</span></h2>
                <button class="btn-primary" onclick="addTeamMember()"><i class="fa-solid fa-user-plus"></i> Validate & Add Member</button>
            </div>
            <div class="member-list">
                ${teamMembers.length === 0 ? '<p class="empty-state">No members added yet. Add someone to start assigning tasks!</p>' : ''}
                ${teamMembers.map((m, idx) => `
                    <div class="member-card">
                        <div class="member-info">
                            <div class="member-avatar">${m.charAt(0).toUpperCase()}</div>
                            <span style="font-weight:600; font-size:1.1rem;">${m}</span>
                        </div>
                        <button class="btn-delete" onclick="removeTeamMember(${idx})" style="border:none; background:transparent; cursor:pointer; color:var(--text-muted); font-size:1.1rem;"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function setupEventListeners() {
        btnPersonal.addEventListener('click', () => setMode('personal'));
        btnProfessional.addEventListener('click', () => setMode('professional'));
        themeBtns.forEach(btn => btn.addEventListener('click', (e) => setTheme(e.currentTarget.getAttribute('data-theme'))));

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');
                switchView(item.getAttribute('data-view'), item.querySelector('span').textContent);
            });
        });

        closeModals.forEach(btn => btn.addEventListener('click', closeModal));
        document.querySelectorAll('.modal-overlay').forEach(ov => {
            ov.addEventListener('click', (e) => { if(e.target === ov) closeModal(); });
        });

        btnAddTask.addEventListener('click', openModal);
        btnAddSubtask.addEventListener('click', addTempSubtask);
        subtaskInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') { e.preventDefault(); addTempSubtask(); } });
        taskForm.addEventListener('submit', handleTaskSubmit);

        searchTask.addEventListener('input', renderTaskList);
        filterStatus.addEventListener('change', renderTaskList);

        const btnAddEvent = document.getElementById('btn-add-event');
        if(btnAddEvent) btnAddEvent.addEventListener('click', openEventModal);
        eventForm.addEventListener('submit', handleEventSubmit);

        document.getElementById('prev-month').addEventListener('click', () => {
            currentCalMonth--;
            if(currentCalMonth < 0) { currentCalMonth = 11; currentCalYear--; }
            renderCalendar();
        });
        document.getElementById('next-month').addEventListener('click', () => {
            currentCalMonth++;
            if(currentCalMonth > 11) { currentCalMonth = 0; currentCalYear++; }
            renderCalendar();
        });
    }

    function setMode(mode) {
        currentMode = mode;
        htmlEl.setAttribute('data-mode', mode);
        btnPersonal.classList.toggle('active', mode === 'personal');
        btnProfessional.classList.toggle('active', mode === 'professional');
        
        const catRadio = document.querySelector(`input[name="task-category"][value="${mode}"]`);
        if(catRadio) catRadio.checked = true;

        document.querySelectorAll('.pro-only').forEach(el => {
            el.style.display = (mode === 'professional') ? 'flex' : 'none';
        });

        if(mode === 'personal' && currentView === 'team') {
            document.querySelector('[data-view="dashboard"]').click();
        }

        const eIcon = document.getElementById('nav-icon-events');
        const eText = document.getElementById('nav-text-events');
        const eHead = document.getElementById('events-header-title');
        const eInputHead = document.getElementById('event-title-label');
        const eInput = document.getElementById('event-title');
        
        if (mode === 'personal') {
            if(eIcon) eIcon.className = 'fa-solid fa-cake-candles';
            if(eText) eText.textContent = 'Life Events';
            if(eHead) eHead.textContent = 'Personal & Life Events';
            if(eInputHead) eInputHead.textContent = 'Event (Birthday, Anniversary)';
            if(eInput) eInput.placeholder = "E.g., Mom's Birthday";
        } else {
            if(eIcon) eIcon.className = 'fa-solid fa-handshake';
            if(eText) eText.textContent = 'Pro Events';
            if(eHead) eHead.textContent = 'Meetings & Conferences';
            if(eInputHead) eInputHead.textContent = 'Event (Meeting, Seminar)';
            if(eInput) eInput.placeholder = "E.g., Q3 Strategy Meeting";
        }

        refreshAllViews();
    }

    function setTheme(theme) {
        currentTheme = theme;
        htmlEl.setAttribute('data-theme', theme);
        localStorage.setItem('taskflow_theme', theme);

        themeBtns.forEach(b => b.classList.remove('active'));
        const activeBtn = document.querySelector(`.theme-btn[data-theme="${theme}"]`);
        if(activeBtn) activeBtn.classList.add('active');
    }

    function switchView(viewId, titleStr) {
        currentView = viewId;
        views.forEach(v => v.classList.remove('active'));
        const activeV = document.getElementById(`view-${viewId}`);
        if(activeV) activeV.classList.add('active');
        viewTitle.textContent = titleStr;
        
        if(viewId === 'calendar') renderCalendar();
        else if (viewId === 'list') renderTaskList();
        else if (viewId === 'team') renderTeamView();
        else if (viewId === 'events') renderEventsList();
    }

    function refreshAllViews() {
        updateDashboard();
        renderTaskList();
        if(currentView === 'calendar') renderCalendar();
        if(currentView === 'team') renderTeamView();
        if(currentView === 'events') renderEventsList();
    }

    function updateDashboard() {
        const modeTasks = getVisibleTasks();
        const completed = modeTasks.filter(t => t.completed).length;
        const total = modeTasks.length;
        const pending = total - completed;
        
        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-completed').textContent = completed;
        document.getElementById('stat-pending').textContent = pending;

        const perc = total === 0 ? 0 : Math.round((completed / total) * 100);
        document.getElementById('overall-progress').style.width = `${perc}%`;
        document.getElementById('progress-text').textContent = `${perc}%`;

        const remindersDiv = document.getElementById('reminders-list');
        const upcomingTasks = modeTasks.filter(t => !t.completed && t.dueDate && t.dueDate >= getTodayStr());
        const upcomingEvents = events.filter(e => e.mode === currentMode && e.owner === currentUser && e.date >= getTodayStr());
        
        const allUpcoming = [
            ...upcomingTasks.map(t => ({...t, isEvent: false})),
            ...upcomingEvents.map(e => ({...e, isEvent: true, dueDate: e.date, dueTime: e.time}))
        ].sort((a,b) => a.dueDate.localeCompare(b.dueDate))
         .slice(0, 4); 
        
        if(allUpcoming.length === 0) {
            remindersDiv.innerHTML = '<p class="empty-state">No upcoming reminders or events</p>';
        } else {
            remindersDiv.innerHTML = allUpcoming.map(item => `
                <div class="task-card">
                    <div class="task-header" style="align-items:center;">
                        <div class="task-main">
                            <div class="task-title" style="font-size:1rem;">
                                ${item.isEvent ? `<i class="fa-solid fa-star" style="color:var(--warning-color); margin-right:5px;"></i>` : ''}
                                ${item.title}
                            </div>
                            <div class="task-meta">
                                <span><i class="fa-regular fa-calendar"></i> ${formatDate(item.dueDate)}</span>
                                ${item.dueTime ? `<span><i class="fa-regular fa-clock"></i> ${formatTime12Hr(item.dueTime)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    function openEventModal() {
        editingEventId = null;
        eventForm.reset();
        document.getElementById('event-date').value = getTodayStr();
        document.getElementById('event-modal-title').textContent = currentMode === 'personal' ? 'Create New Personal Event' : 'Create New Professional Event';
        
        document.getElementById('event-email-check').checked = false;
        document.getElementById('event-email-offset-val').disabled = true;
        document.getElementById('event-email-offset-unit').disabled = true;
        document.getElementById('event-email-offset-val').value = 5;
        document.getElementById('event-email-offset-unit').value = 'minutes';

        eventModal.classList.add('active');
    }

    function handleEventSubmit(e) {
        e.preventDefault();
        const title = document.getElementById('event-title').value;
        const desc = document.getElementById('event-desc').value;
        const date = document.getElementById('event-date').value;
        const time = document.getElementById('event-time').value;

        const emailCheck = document.getElementById('event-email-check').checked;
        const valInput = document.getElementById('event-email-offset-val').value;
        const unitInput = document.getElementById('event-email-offset-unit').value;
        const emailConfig = emailCheck ? { enabled: true, value: valInput, unit: unitInput } : null;

        let evId;

        if(editingEventId) {
            const idx = events.findIndex(ev => ev.id === editingEventId);
            if(idx > -1) {
                events[idx].title = title;
                events[idx].description = desc;
                events[idx].date = date;
                events[idx].time = time;
                events[idx].emailConfig = emailConfig;
                evId = events[idx].id;
                saveEvents();
                showToast("Event updated!");
            }
        } else {
            evId = Date.now().toString();
            events.push({
                id: evId, title, description: desc, date, time,
                mode: currentMode, owner: currentUser, emailConfig
            });
            saveEvents();
            showToast("New event added!");
        }

        if(emailCheck && date && time) {
            scheduleEmailBackend(evId, title, 'event', date, time, valInput, unitInput);
        } else if (!emailCheck) {
            cancelEmailBackend(evId);
        }

        closeModal();
        refreshAllViews();
    }

    window.editEvent = function(id) {
        const e = events.find(ev => ev.id === id);
        if(!e) return;
        if(e.owner !== currentUser) return;

        editingEventId = id;
        document.getElementById('event-title').value = e.title;
        document.getElementById('event-desc').value = e.description || '';
        document.getElementById('event-date').value = e.date || '';
        document.getElementById('event-time').value = e.time || '';
        
        const emCheck = document.getElementById('event-email-check');
        const emVal = document.getElementById('event-email-offset-val');
        const emUnit = document.getElementById('event-email-offset-unit');
        
        if(e.emailConfig && e.emailConfig.enabled) {
            emCheck.checked = true;
            emVal.disabled = false;
            emUnit.disabled = false;
            emVal.value = e.emailConfig.value || e.emailConfig.offset || 5;
            emUnit.value = e.emailConfig.unit || 'minutes';
        } else {
            emCheck.checked = false;
            emVal.disabled = true;
            emUnit.disabled = true;
            emVal.value = 5;
            emUnit.value = 'minutes';
        }

        document.getElementById('event-modal-title').textContent = 'Edit Event';
        eventModal.classList.add('active');
    };

    window.deleteEvent = function(id) {
        if(confirm('Delete this event?')) {
            events = events.filter(e => e.id !== id);
            saveEvents();
            cancelEmailBackend(id);
            refreshAllViews();
            showToast("Event removed successfully.");
        }
    };

    function renderEventsList() {
        const eventsList = document.getElementById('events-list');
        if(!eventsList) return;

        let visibleEvents = events.filter(e => e.mode === currentMode && e.owner === currentUser);
        
        if(visibleEvents.length === 0) {
            eventsList.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 40px; color:var(--text-muted);"><i class="fa-regular fa-calendar-xmark" style="font-size:3rem; margin-bottom:15px; color:var(--primary-color);"></i><br><h2 style="color:var(--text-main);">No Upcoming Events</h2><p style="margin-top:10px;">Click the button above to start tracking dates!</p></div>`;
            return;
        }

        visibleEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

        eventsList.innerHTML = visibleEvents.map(e => {
            const dateObj = new Date(e.date);
            const rMonth = dateObj.toLocaleDateString('en-US', {month: 'short'});
            const rDay = dateObj.toLocaleDateString('en-US', {day: '2-digit'});
            
            return `
                <div class="event-card">
                    <div class="event-date-box">
                        <span class="event-date-month">${rMonth}</span>
                        <span class="event-date-day">${rDay}</span>
                    </div>
                    <div class="event-info">
                        <div class="event-title">${e.title}</div>
                        ${e.description ? `<div class="event-desc">${e.description}</div>` : ''}
                        <div class="event-meta">
                            ${e.time ? `<span><i class="fa-regular fa-clock"></i> ${formatTime12Hr(e.time)}</span>` : '<span><i class="fa-regular fa-sun"></i> All Day</span>'}
                            ${e.emailConfig && e.emailConfig.enabled ? `<span style="margin-left:10px; color:var(--primary-color);"><i class="fa-solid fa-envelope"></i> Email Scheduled</span>` : ''}
                        </div>
                        <div class="event-actions">
                            <button onclick="editEvent('${e.id}')"><i class="fa-solid fa-pen"></i></button>
                            <button onclick="deleteEvent('${e.id}')"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderTaskList() {
        const listDiv = document.getElementById('main-task-list');
        const searchTerm = searchTask.value.toLowerCase();
        const status = filterStatus.value; 
        let filtered = getVisibleTasks();
        if(searchTerm) filtered = filtered.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.description && t.description.toLowerCase().includes(searchTerm)));
        if(status === 'completed') filtered = filtered.filter(t => t.completed);
        if(status === 'pending') filtered = filtered.filter(t => !t.completed);

        if(filtered.length === 0) {
            listDiv.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:30px;">No tasks found based on current filters.</div>';
            return;
        }

        listDiv.innerHTML = '';
        filtered.forEach(t => {
            const card = document.createElement('div');
            card.className = `task-card ${t.completed ? 'completed' : ''}`;
            const isOverdue = !t.completed && t.dueDate && t.dueDate < getTodayStr();

            let subtasksHtml = '';
            if(t.subtasks && t.subtasks.length > 0) {
                subtasksHtml = `
                    <div class="subtasks-wrapper">
                        ${t.subtasks.map((st, idx) => `
                            <div class="subtask-item">
                                <div class="scustom-chk ${st.done ? 'done' : ''}" data-taskid="${t.id}" data-stidx="${idx}">
                                    <i class="fa-solid fa-check"></i>
                                </div>
                                <span class="subtask-text ${st.done ? 'done' : ''}">${st.text}</span>
                            </div>
                        `).join('')}
                    </div>
                `;
            }

            const canCheck = (t.category === 'professional' && t.assignee && t.assignee !== '') ? (t.assignee === currentUser) : (t.owner === currentUser);
            const canEdit = t.owner === currentUser;

            card.innerHTML = `
                <div class="task-header">
                    <div class="task-checkbox-wrap">
                        <div class="custom-checkbox" data-id="${t.id}" style="${!canCheck ? 'opacity:0.4; cursor:not-allowed;' : ''}">
                            <i class="fa-solid fa-check"></i>
                        </div>
                    </div>
                    <div class="task-main">
                        <div class="task-title">${t.title}</div>
                        ${t.description ? `<div class="task-desc">${t.description}</div>` : ''}
                        <div class="task-meta">
                            ${t.assignee && t.category === 'professional' && t.owner === currentUser ? `<span class="assign-pill"><i class="fa-solid fa-user-check"></i> Assigned to ${t.assignee.split('@')[0]}</span>` : ''}
                            ${t.assignee === currentUser && t.owner !== currentUser ? `<span class="assign-pill" style="border-color:var(--warning-color); color:var(--warning-color); background:transparent;"><i class="fa-solid fa-crown"></i> Delegated to you by ${t.owner.split('@')[0]}</span>` : ''}
                            ${t.dueDate ? `<span class="${isOverdue ? 'overdue' : ''}"><i class="fa-regular fa-calendar"></i> ${formatDate(t.dueDate)}</span>` : ''}
                            ${t.dueTime ? `<span><i class="fa-regular fa-clock"></i> ${formatTime12Hr(t.dueTime)}</span>` : ''}
                            ${t.emailConfig && t.emailConfig.enabled ? `<span style="margin-left:10px; color:var(--primary-color);"><i class="fa-solid fa-envelope"></i></span>` : ''}
                        </div>
                    </div>
                    <div class="task-actions">
                        <button class="btn-edit" data-id="${t.id}" style="${!canEdit ? 'opacity:0.3; cursor:not-allowed;' : ''}"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn-delete" data-id="${t.id}" style="${!canEdit ? 'opacity:0.3; cursor:not-allowed;' : ''}"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </div>
                ${subtasksHtml}
            `;
            listDiv.appendChild(card);
        });

        document.querySelectorAll('.custom-checkbox').forEach(chk => {
            chk.addEventListener('click', (e) => toggleTaskStatus(e.currentTarget.getAttribute('data-id'), getNormalizedCoordinates(e.currentTarget)));
        });
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => deleteTask(e.currentTarget.getAttribute('data-id')));
        });
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => editTask(e.currentTarget.getAttribute('data-id')));
        });
        document.querySelectorAll('.scustom-chk').forEach(btn => {
            btn.addEventListener('click', (e) => toggleSubtaskStatus(e.currentTarget.getAttribute('data-taskid'), parseInt(e.currentTarget.getAttribute('data-stidx')), getNormalizedCoordinates(e.currentTarget)));
        });
    }

    function checkTaskStatus(task) {
        if(!task.dueDate) return 'celebrate';
        const now = new Date();
        const dueStr = task.dueDate + (task.dueTime ? 'T' + task.dueTime : 'T23:59:00');
        return (now <= new Date(dueStr)) ? 'celebrate' : 'late';
    }

    function toggleTaskStatus(id, coords) {
        const tk = tasks.find(t => t.id === id);
        if(tk) {
            if(tk.category === 'professional' && tk.assignee && tk.assignee !== '') {
                if(tk.assignee !== currentUser) return showToast("Permission Denied: Only the delegated assignee can mark this as completed.");
            } else {
                if(tk.owner !== currentUser) return showToast("Permission Denied: Only the owner of this task can mark it completed.");
            }
            tk.completed = !tk.completed;
            saveTasks();
            if(tk.completed) {
                playSound(checkTaskStatus(tk));
                if(coords) triggerConfetti(coords.x, coords.y);
            }
            refreshAllViews();
        }
    }
    
    function toggleSubtaskStatus(taskId, stIndex, coords) {
        const tk = tasks.find(t => t.id === taskId);
        if(tk && tk.subtasks[stIndex]) {
            if(tk.category === 'professional' && tk.assignee && tk.assignee !== '') {
                if(tk.assignee !== currentUser) return showToast("Permission Denied: Only the delegated assignee can complete subtasks.");
            } else {
                if(tk.owner !== currentUser) return showToast("Permission Denied: Only the owner can complete subtasks.");
            }
            tk.subtasks[stIndex].done = !tk.subtasks[stIndex].done;
            saveTasks();
            if(tk.subtasks[stIndex].done) {
                playSound('normal');
                if(coords) triggerConfetti(coords.x, coords.y);
            }
            renderTaskList(); 
        }
    }

    function deleteTask(id) {
        const tk = tasks.find(t => t.id === id);
        if(!tk) return;
        if(tk.owner !== currentUser) return showToast("Permission Denied: Only the creator of the task has permission to delete it.");

        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        cancelEmailBackend(id);
        refreshAllViews();
        showToast("Task deleted successfully.");
    }

    function closeModal() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        editingTaskId = null;
        editingEventId = null;
    }

    function openModal() {
        editingTaskId = null;
        taskForm.reset();
        const catRadio = document.querySelector(`input[name="task-category"][value="${currentMode}"]`);
        if(catRadio) catRadio.checked = true;
        document.getElementById('task-date').value = getTodayStr();
        
        const assignSel = document.getElementById('task-assignee');
        if(assignSel) {
            assignSel.innerHTML = '<option value="">Just Me / Unassigned</option>';
            teamMembers.forEach(m => assignSel.innerHTML += `<option value="${m}">${m}</option>`);
        }

        document.getElementById('task-email-check').checked = false;
        document.getElementById('task-email-offset-val').disabled = true;
        document.getElementById('task-email-offset-unit').disabled = true;
        document.getElementById('task-email-offset-val').value = 5;
        document.getElementById('task-email-offset-unit').value = 'minutes';

        tempSubtasks = [];
        renderTempSubtasks();
        document.querySelector('.modal-header h2').textContent = 'Create New Task';
        document.querySelector('.modal-footer .btn-primary').textContent = 'Save Task';
        modal.classList.add('active');
    }

    function editTask(id) {
        const tk = tasks.find(t => t.id === id);
        if(!tk) return;
        if(tk.owner !== currentUser) return showToast("Security Block: Only the task creator can modify or delegate the details of this task.");

        editingTaskId = id;
        document.getElementById('task-title').value = tk.title;
        document.getElementById('task-desc').value = tk.description || '';
        document.getElementById('task-date').value = tk.dueDate || '';
        document.getElementById('task-time').value = tk.dueTime || '';
        const catRadio = document.querySelector(`input[name="task-category"][value="${tk.category}"]`);
        if(catRadio) catRadio.checked = true;
        const assignSel = document.getElementById('task-assignee');
        if(assignSel) {
            assignSel.innerHTML = '<option value="">Just Me / Unassigned</option>';
            teamMembers.forEach(m => assignSel.innerHTML += `<option value="${m}">${m}</option>`);
            if(tk.assignee) assignSel.value = tk.assignee;
        }
        
        const emCheck = document.getElementById('task-email-check');
        const emVal = document.getElementById('task-email-offset-val');
        const emUnit = document.getElementById('task-email-offset-unit');
        if(tk.emailConfig && tk.emailConfig.enabled) {
            emCheck.checked = true;
            emVal.disabled = false;
            emUnit.disabled = false;
            emVal.value = tk.emailConfig.value || tk.emailConfig.offset || 5;
            emUnit.value = tk.emailConfig.unit || 'minutes';
        } else {
            emCheck.checked = false;
            emVal.disabled = true;
            emUnit.disabled = true;
            emVal.value = 5;
            emUnit.value = 'minutes';
        }

        tempSubtasks = JSON.parse(JSON.stringify(tk.subtasks || []));
        renderTempSubtasks();
        document.querySelector('.modal-header h2').textContent = 'Edit Task';
        document.querySelector('.modal-footer .btn-primary').textContent = 'Update Task';
        modal.classList.add('active');
    }

    function addTempSubtask() {
        const val = subtaskInput.value.trim();
        if(val) {
            tempSubtasks.push({ id: Date.now().toString(), text: val, done: false });
            subtaskInput.value = '';
            renderTempSubtasks();
        }
    }

    function renderTempSubtasks() {
        checklistContainer.innerHTML = '';
        tempSubtasks.forEach((st, idx) => {
            const div = document.createElement('div');
            div.className = 'subtask-item';
            div.style.marginBottom = '8px';
            div.innerHTML = `
                <i class="fa-solid fa-list-ul" style="color:var(--text-muted); font-size:12px;"></i>
                <span style="flex:1;">${st.text}</span>
                <button type="button" style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="removeTempSubtask(${idx})"><i class="fa-solid fa-xmark"></i></button>
            `;
            checklistContainer.appendChild(div);
        });
    }

    window.removeTempSubtask = function(idx) {
        tempSubtasks.splice(idx, 1);
        renderTempSubtasks();
    }

    function handleTaskSubmit(e) {
        e.preventDefault();
        const title = document.getElementById('task-title').value;
        const desc = document.getElementById('task-desc').value;
        const date = document.getElementById('task-date').value;
        const time = document.getElementById('task-time').value;
        
        let category = 'personal';
        const catRadio = document.querySelector('input[name="task-category"]:checked');
        if(catRadio) category = catRadio.value;

        let assignee = '';
        const assignSel = document.getElementById('task-assignee');
        if(assignSel && assignSel.style.display !== 'none' && currentMode === 'professional') {
            assignee = assignSel.value;
        }

        const emailCheck = document.getElementById('task-email-check').checked;
        const valInput = document.getElementById('task-email-offset-val').value;
        const unitInput = document.getElementById('task-email-offset-unit').value;
        const emailConfig = emailCheck ? { enabled: true, value: valInput, unit: unitInput } : null;

        let tkId;

        if (editingTaskId) {
            const tkIndex = tasks.findIndex(t => t.id === editingTaskId);
            if(tkIndex > -1) {
                tasks[tkIndex].title = title;
                tasks[tkIndex].description = desc;
                tasks[tkIndex].dueDate = date;
                tasks[tkIndex].dueTime = time;
                tasks[tkIndex].category = category;
                tasks[tkIndex].assignee = assignee;
                tasks[tkIndex].subtasks = [...tempSubtasks];
                tasks[tkIndex].emailConfig = emailConfig;
                tkId = tasks[tkIndex].id;
                saveTasks();
                showToast("Task updated successfully!");
            }
        } else {
            tkId = Date.now().toString();
            tasks.push({
                id: tkId, title, description: desc, dueDate: date, dueTime: time,
                category, assignee, completed: false, subtasks: [...tempSubtasks],
                owner: currentUser, emailConfig
            });
            saveTasks();
            showToast("New task created!");
        }

        if(emailCheck && date && time) {
            const sendTo = (assignee && assignee !== '') ? assignee : currentUser;
            scheduleEmailBackend(tkId, title, 'task', date, time, valInput, unitInput, sendTo);
        } else if (!emailCheck) {
            cancelEmailBackend(tkId);
        }

        closeModal();
        refreshAllViews();
    }

    function renderCalendar() {
        const grid = document.getElementById('calendar-days');
        const header = document.getElementById('calendar-month-year');
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        header.textContent = `${monthNames[currentCalMonth]} ${currentCalYear}`;
        grid.innerHTML = '';
        
        const firstDayOfMonth = new Date(currentCalYear, currentCalMonth, 1).getDay(); 
        const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
        const prevMonthDays = new Date(currentCalYear, currentCalMonth, 0).getDate();
        
        for(let i = firstDayOfMonth - 1; i >= 0; i--) {
            const prevDate = prevMonthDays - i;
            grid.innerHTML += `<div class="day empty"><span class="day-num" style="opacity:0.3">${prevDate}</span></div>`;
        }
        
        for(let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${currentCalYear}-${String(currentCalMonth+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
            const dayTasks = getVisibleTasks().filter(t => t.dueDate === dateStr);
            const dayEvents = events.filter(e => e.date === dateStr && e.mode === currentMode && e.owner === currentUser);
            
            let dotsHtml = '';
            if(dayTasks.length > 0 || dayEvents.length > 0) {
                dotsHtml = `<div class="dots-container">`;
                dayEvents.forEach((ev) => dotsHtml += `<div class="event-dot" title="${ev.title}"></div>`);
                dayTasks.forEach((t, idx) => {
                    if(idx < 3) dotsHtml += `<div class="task-dot" ${t.completed ? 'style="background:var(--success-color);"' : ''} title="${t.title}"></div>`;
                });
                if(dayTasks.length > 3) dotsHtml += `<div class="task-dot-more">+${dayTasks.length-3}</div>`;
                dotsHtml += `</div>`;
            }
            
            const isToday = dateStr === getTodayStr();
            grid.innerHTML += `
                <div class="day ${isToday ? 'today' : ''}" data-date="${dateStr}">
                    <span class="day-num">${i}</span>
                    ${dotsHtml}
                </div>
            `;
        }
        
        const totalRenderedSoFar = firstDayOfMonth + daysInMonth;
        const remainder = totalRenderedSoFar % 7;
        if(remainder !== 0) {
            const trailingNeeded = 7 - remainder;
            for(let i = 1; i <= trailingNeeded; i++) {
                grid.innerHTML += `<div class="day empty"><span class="day-num" style="opacity:0.3">${i}</span></div>`;
            }
        }

        document.querySelectorAll('.day:not(.empty)').forEach(d => {
            d.addEventListener('click', (e) => document.querySelector('[data-view="list"]').click());
        });
    }

    function getTodayStr() {
        const d = new Date();
        const tzOffset = d.getTimezoneOffset() * 60000;
        const localISOTime = (new Date(d - tzOffset)).toISOString().slice(0, -1);
        return localISOTime.split('T')[0];
    }
    function formatDate(dateString) {
        if (!dateString) return '';
        const d = dateString.split('-');
        if(d.length !== 3) return dateString;
        const date = new Date(d[0], d[1]-1, d[2]);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    function formatTime12Hr(timeStr) {
        if(!timeStr) return '';
        const [h, m] = timeStr.split(':');
        let hours = parseInt(h);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; 
        return `${hours}:${m} ${ampm}`;
    }
    function showToast(message) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--primary-color)"></i> ${message}`;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    let lastCheckedMinute = -1;
    function checkReminders() {
        if(!currentUser) return;
        const now = new Date();
        const m = now.getMinutes();
        if(m === lastCheckedMinute) return; 
        lastCheckedMinute = m;

        const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
        const todayStr = getTodayStr();
        
        getVisibleTasks().forEach(t => {
            if(!t.completed && t.dueDate === todayStr && t.dueTime === timeStr) {
                showToast(`Task Reminder: ${t.title}`);
            }
        });

        events.forEach(e => {
            if(e.mode === currentMode && e.owner === currentUser && e.date === todayStr && e.time === timeStr) {
                showToast(`Event Starting: ${e.title}`);
            }
        });
    }
});
