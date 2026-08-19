const SHEET_URL = 'https://script.google.com/macros/s/AKfycbzO2DypSk8JPZUDeFTTpzGURLViMLLzVbBqzWxctkOeu3WPiU4kB3wCavr7e9DHdkoI/exec';

let allData = [];
let filteredData = [];
let archiveData = [];
let currentDashboardPeriod = 'day';

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainWrapper = document.getElementById('mainWrapper');
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        sidebar.classList.toggle('open');
    } else {
        sidebar.classList.toggle('closed');
        mainWrapper.classList.toggle('expanded');
    }
}

async function loadData(showIndicator = false) {
    try {
        if (showIndicator) {
            document.getElementById('updateIndicator').classList.add('show');
        }

        const cacheBuster = new Date().getTime();
        const response = await fetch(`${SHEET_URL}?t=${cacheBuster}`);
        
        if (!response.ok) {
            throw new Error('API Error');
        }
        
        const rows = await response.json();

        let tempAllData = rows.slice(1)
            .map(row => {
                let tDate = row.length > 19 ? row[19] : '';
                let bDate = row.length > 1 ? row[1] : '';
                let finalDate = (tDate && tDate.trim() !== '') ? tDate.trim() : (bDate ? bDate.trim() : '');

                return {
                    date: finalDate,
                    quantity: row.length > 5 ? row[5] : '',
                    unit: row.length > 6 ? row[6] : '',
                    tracking: row.length > 7 ? row[7] : '',
                    productName: row.length > 9 ? row[9] : '',
                    statusRaw: row.length > 10 ? row[10] : '',
                    remark: row.length > 14 ? row[14] : '',
                    deliveryDate: row.length > 15 ? row[15] : ''
                };
            })
            .filter(item => item.tracking && item.tracking.trim() !== '');

        if (tempAllData.length === 0 && allData.length > 0) {
            throw new Error('Empty Data Anomaly');
        }

        allData = tempAllData;

        if (allData.length > 0) {
            const {recent, archive} = splitDataByDate(allData);
            filteredData = recent;
            archiveData = archive;
            
            populateDropdowns(filteredData);
            showDashboard(currentDashboardPeriod);

            applyFilters();
            applyArchiveFilters();
        }

        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';

        if (showIndicator) {
            setTimeout(() => {
                document.getElementById('updateIndicator').classList.remove('show');
            }, 2000);
        }

    } catch (error) {
        if (allData.length === 0) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('error').style.display = 'block';
            document.getElementById('error').textContent = '❌ ไม่สามารถโหลดข้อมูลได้ โปรดตรวจสอบ API';
        }
    }
}

function parseDate(dateString) {
    if (!dateString) return null;
    
    let str = dateString.trim();

    const regexDDMMYYYY = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/;
    const match = str.match(regexDDMMYYYY);
    
    if (match) {
        const day = parseInt(match[1]);
        const month = parseInt(match[2]) - 1; 
        const year = parseInt(match[3]);
        const hours = match[4] ? parseInt(match[4]) : 0;
        const minutes = match[5] ? parseInt(match[5]) : 0;
        const seconds = match[6] ? parseInt(match[6]) : 0;
        
        return new Date(year, month, day, hours, minutes, seconds);
    }

    const monthMap = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
    };
    const regexDDMMMYYYY = /^(\d{1,2})[\/\-](\w{3})[\/\-](\d{4})/;
    const matchMMM = str.toLowerCase().match(regexDDMMMYYYY);
    if (matchMMM && monthMap[matchMMM[2]] !== undefined) {
        return new Date(parseInt(matchMMM[3]), monthMap[matchMMM[2]], parseInt(matchMMM[1]));
    }

    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

function splitDataByDate(data) {
    const today = new Date();
    
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    oneMonthAgo.setHours(0, 0, 0, 0);

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(today.getMonth() - 2);
    twoMonthsAgo.setHours(0, 0, 0, 0);

    const recent = [];
    const archive = [];

    data.forEach(item => {
        const orderDate = parseDate(item.date);
        if (!orderDate) {
            recent.push(item);
            return;
        }
        
        if (orderDate >= oneMonthAgo) {
            recent.push(item);
        } else if (orderDate >= twoMonthsAgo && orderDate < oneMonthAgo) {
            archive.push(item);
        }
    });

    return {recent, archive};
}

function formatDateDisplay(dateString) {
    return dateString ? dateString : '';
}

function formatStatus(statusRaw) {
    let status = statusRaw ? statusRaw.trim() : '';
    if (status === '' || status.toLowerCase() === 'on process') return 'ON PROCESS';
    
    let lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('complete') || lowerStatus.includes('po issued')) {
        return 'PO ISSUED';
    }
    if (lowerStatus.includes('reject') || lowerStatus.includes('decline')) {
        return 'DECLINED (CHECK REMARK)';
    }
    
    return status;
}

function getStatusType(statusRaw) {
    const status = statusRaw ? statusRaw.trim().toLowerCase() : '';
    if (status.includes('complete') || status.includes('po issued')) return 'completed';
    if (status.includes('reject') || status.includes('decline')) return 'rejected';
    if (status.includes('pick up') || status.includes('12th')) return 'pickup';
    return 'process';
}

function displayData(data) {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        document.getElementById('dataTable').style.display = 'none';
        document.getElementById('noData').style.display = 'block';
        return;
    }

    document.getElementById('dataTable').style.display = 'table';
    document.getElementById('noData').style.display = 'none';

    data.forEach(item => {
        const row = tbody.insertRow();
        
        let status = formatStatus(item.statusRaw);
        const type = getStatusType(item.statusRaw);
        
        let statusClass = 'status-process';
        if (type === 'completed') statusClass = 'status-completed';
        else if (type === 'rejected') statusClass = 'status-rejected';
        else if (type === 'pickup') statusClass = 'status-pickup';

        row.innerHTML = `
            <td>${formatDateDisplay(item.date)}</td>
            <td><strong>${item.tracking}</strong></td>
            <td>${item.productName}</td>
            <td>${item.quantity}</td>
            <td>${item.unit}</td>
            <td>${item.deliveryDate}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td>${item.remark}</td>
        `;
    });
}

function displayArchiveData(data) {
    const tbody = document.getElementById('archiveTableBody');
    tbody.innerHTML = '';

    document.getElementById('archiveTotalOrders').textContent = data.length;
    document.getElementById('archiveCompletedOrders').textContent = data.length;

    if (data.length === 0) {
        document.getElementById('archiveTable').style.display = 'none';
        document.getElementById('archiveNoData').style.display = 'block';
        return;
    }

    document.getElementById('archiveTable').style.display = 'table';
    document.getElementById('archiveNoData').style.display = 'none';

    data.forEach(item => {
        const row = tbody.insertRow();
        let rawStat = item.statusRaw ? item.statusRaw.trim() : 'PO ISSUED';
        let status = formatStatus(rawStat);
        const type = getStatusType(rawStat);
        
        let statusClass = 'status-process';
        if (type === 'completed') statusClass = 'status-completed';
        else if (type === 'rejected') statusClass = 'status-rejected';
        else if (type === 'pickup') statusClass = 'status-pickup';

        row.innerHTML = `
            <td>${formatDateDisplay(item.date)}</td>
            <td><strong>${item.tracking}</strong></td>
            <td>${item.productName}</td>
            <td>${item.quantity}</td>
            <td>${item.unit}</td>
            <td>${item.deliveryDate}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
            <td>${item.remark}</td>
        `;
    });
}

function updateStats(data) {
    const total = data.length;
    let process = 0, completed = 0, rejected = 0, pickup = 0;

    data.forEach(item => {
        const type = getStatusType(item.statusRaw);
        if (type === 'completed') completed++;
        else if (type === 'rejected') rejected++;
        else if (type === 'pickup') pickup++;
        else process++;
    });

    document.getElementById('totalOrders').textContent = total;
    document.getElementById('processOrders').textContent = process;
    document.getElementById('completedOrders').textContent = completed;
    document.getElementById('pickupOrders').textContent = pickup;
    document.getElementById('rejectedOrders').textContent = rejected;
}

function showDashboard(period) {
    currentDashboardPeriod = period;
    const title = period === 'day' ? 'รายวัน' : period === 'week' ? 'รายสัปดาห์' : 'รายเดือน';
    document.getElementById('dashboardTitle').textContent = `Dashboard - ${title}`;

    const stats = calculateStats(filteredData, period);
    displayDashboardCharts(stats);
    displayBarChart(stats);
}

function calculateStats(data, period) {
    const grouped = {};

    data.forEach(item => {
        const date = parseDate(item.date);
        if (!date) return;

        let key;
        if (period === 'day') {
            const day = date.getDate();
            const month = date.toLocaleString('en-GB', { month: 'short' });
            const year = date.getFullYear();
            key = `${day} ${month} ${year}`;
        } else if (period === 'week') {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const day = weekStart.getDate();
            const month = weekStart.toLocaleString('en-GB', { month: 'short' });
            key = `Week of ${day} ${month}`;
        } else {
            key = `${date.toLocaleString('en-GB', {month: 'long', year: 'numeric'})}`;
        }

        if (!grouped[key]) {
            grouped[key] = {total: 0, completed: 0, process: 0, rejected: 0, pickup: 0};
        }

        grouped[key].total++;
        const type = getStatusType(item.statusRaw);
        if (type === 'completed') grouped[key].completed++;
        else if (type === 'rejected') grouped[key].rejected++;
        else if (type === 'pickup') grouped[key].pickup++;
        else grouped[key].process++;
    });

    return grouped;
}

function displayDashboardCharts(stats) {
    const container = document.getElementById('dashboardCharts');
    container.innerHTML = '';

    Object.keys(stats).forEach(key => {
        const item = stats[key];
        const div = document.createElement('div');
        div.className = 'chart-item';
        div.innerHTML = `
            <h4>${key}</h4>
            <div style="margin-bottom: 15px;">
                <span style="font-size: 24px; font-weight: 700; color: #00f2fe;">${item.total}</span> <span style="color:#a0a5b1; font-size:14px;">รายการ</span>
            </div>
            
            <div class="chart-detail-row">
                <div class="chart-detail-label"><span class="dot dot-completed"></span> PO Issued</div>
                <span>${item.completed}</span>
            </div>
            <div class="chart-detail-row">
                <div class="chart-detail-label"><span class="dot dot-process"></span> On Process</div>
                <span>${item.process}</span>
            </div>
            <div class="chart-detail-row">
                <div class="chart-detail-label"><span class="dot dot-pickup"></span> Pick up 12th</div>
                <span>${item.pickup}</span>
            </div>
            <div class="chart-detail-row">
                <div class="chart-detail-label"><span class="dot dot-rejected"></span> Declined</div>
                <span>${item.rejected}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

function displayBarChart(stats) {
    const container = document.getElementById('barChart');
    container.innerHTML = '';

    const maxValue = Math.max(...Object.values(stats).map(s => s.total)) || 1;
    const keys = Object.keys(stats).slice(-10);

    keys.forEach(key => {
        const item = stats[key];
        const barHeight = (item.total / maxValue) * 100;

        const completedH = (item.completed / item.total) * 100;
        const processH = (item.process / item.total) * 100;
        const pickupH = (item.pickup / item.total) * 100;
        const rejectedH = (item.rejected / item.total) * 100;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'bar-wrapper';

        const totalLabel = document.createElement('div');
        totalLabel.className = 'bar-total';
        totalLabel.innerText = item.total;
        
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.height = barHeight + '%';
        bar.appendChild(totalLabel);
        
        if (item.completed > 0) bar.appendChild(createSegment(completedH, 'bg-completed', item.completed));
        if (item.pickup > 0) bar.appendChild(createSegment(pickupH, 'bg-pickup', item.pickup));
        if (item.process > 0) bar.appendChild(createSegment(processH, 'bg-process', item.process));
        if (item.rejected > 0) bar.appendChild(createSegment(rejectedH, 'bg-rejected', item.rejected));

        wrapper.appendChild(bar);
        
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.innerText = key;
        wrapper.appendChild(label);

        container.appendChild(wrapper);
    });
}

function createSegment(height, colorClass, value) {
    const seg = document.createElement('div');
    seg.className = `bar-segment ${colorClass}`;
    seg.style.height = height + '%';
    seg.title = `Value: ${value}`;
    
    if (height > 15) {
        const text = document.createElement('span');
        text.className = 'segment-value';
        text.innerText = value;
        seg.appendChild(text);
    }
    
    return seg;
}

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.trim().toLowerCase();
    const fDate = document.getElementById('filterDate').value;
    const fTracking = document.getElementById('filterTracking').value;
    const fProduct = document.getElementById('filterProduct').value;
    const fQty = document.getElementById('filterQty').value;
    const fUnit = document.getElementById('filterUnit').value;
    const fDeliveryDate = document.getElementById('filterDeliveryDate').value;
    const fStatus = document.getElementById('filterStatus').value;
    const fRemark = document.getElementById('filterRemark').value;

    const results = filteredData.filter(item => {
        const status = formatStatus(item.statusRaw);
        const matchesSearch = searchTerm === '' || 
                              item.tracking.toLowerCase().includes(searchTerm) || 
                              item.productName.toLowerCase().includes(searchTerm);
        
        const matchesDropdowns = (fDate === '' || item.date === fDate) &&
                                 (fTracking === '' || item.tracking === fTracking) &&
                                 (fProduct === '' || item.productName === fProduct) &&
                                 (fQty === '' || item.quantity.toString() === fQty) &&
                                 (fUnit === '' || item.unit === fUnit) &&
                                 (fDeliveryDate === '' || item.deliveryDate === fDeliveryDate) &&
                                 (fStatus === '' || status === fStatus) &&
                                 (fRemark === '' || item.remark === fRemark);

        return matchesSearch && matchesDropdowns;
    });

    displayData(results);
    updateStats(results);
}

function applyArchiveFilters() {
    const searchTerm = document.getElementById('archiveSearchInput').value.trim().toLowerCase();
    const results = archiveData.filter(item => 
        searchTerm === '' ||
        item.tracking.toLowerCase().includes(searchTerm) ||
        item.productName.toLowerCase().includes(searchTerm)
    );
    displayArchiveData(results);
}

function showAll() {
    document.getElementById('searchInput').value = '';
    
    const selects = ['filterDate', 'filterTracking', 'filterProduct', 'filterQty', 'filterUnit', 'filterDeliveryDate', 'filterStatus', 'filterRemark'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    
    applyFilters();
}

function showAllArchive() {
    document.getElementById('archiveSearchInput').value = '';
    applyArchiveFilters();
}

function populateDropdowns(data) {
    function setupDropdown(items, key, elementId) {
        const uniqueValues = [...new Set(items.map(item => {
            return key === 'statusRaw' ? formatStatus(item[key]) : item[key];
        }))].filter(Boolean).sort();

        const select = document.getElementById(elementId);
        const current = select.value;
        
        select.innerHTML = '<option value="">ทั้งหมด</option>';
        uniqueValues.forEach(val => {
            const option = document.createElement('option');
            
            if (key === 'date') {
                option.textContent = formatDateDisplay(val);
                option.value = val;
            } else {
                option.value = val;
                option.textContent = val;
            }
            
            select.appendChild(option);
        });
        
        if (uniqueValues.includes(current) || current === '') {
            select.value = current;
        } else {
            select.value = '';
        }
    }

    setupDropdown(data, 'date', 'filterDate');
    setupDropdown(data, 'tracking', 'filterTracking');
    setupDropdown(data, 'productName', 'filterProduct');
    setupDropdown(data, 'quantity', 'filterQty');
    setupDropdown(data, 'unit', 'filterUnit');
    setupDropdown(data, 'deliveryDate', 'filterDeliveryDate');
    setupDropdown(data, 'remark', 'filterRemark');
    setupDropdown(data, 'statusRaw', 'filterStatus');
}

function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    if (tab === 'orders') {
        document.querySelector('[onclick="switchTab(\'orders\')"]').classList.add('active');
        document.getElementById('ordersTab').classList.add('active');
    } else if (tab === 'dashboard') {
        document.querySelector('[onclick="switchTab(\'dashboard\')"]').classList.add('active');
        document.getElementById('dashboardTab').classList.add('active');
        showDashboard(currentDashboardPeriod);
    } else if (tab === 'archive') {
        document.querySelector('[onclick="switchTab(\'archive\')"]').classList.add('active');
        document.getElementById('archiveTab').classList.add('active');
    }
}

document.getElementById('searchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') applyFilters();
});

document.getElementById('archiveSearchInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') applyArchiveFilters();
});

loadData(false);
setInterval(() => loadData(true), 120000);