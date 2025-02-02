document.addEventListener('DOMContentLoaded', () => {
  const calcContainer = document.getElementById('calcContainer');
  const addCalcBtn = document.getElementById('addCalcBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importJsonBtn');
  const importInput = document.getElementById('importJsonInput');

  // Modal elementi
  const modalOverlay = document.getElementById('modalOverlay');
  const exportFileNameInput = document.getElementById('exportFileName');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const modalOkBtn = document.getElementById('modalOkBtn');

  // Ovde definišemo koji prečnici su dozvoljeni u "inicijalnoj" pretrazi:
  const ALLOWED_DIAMETERS = [8, 10, 12, 16, 20];
  // Ovde definišemo koje su "primarne" distance za inicijalnu pretragu:
  const ALLOWED_DISTANCES = [250, 225, 200, 175, 150, 125, 100, 300];

  let allData = [];
  let allDiameters = new Set();

  // 1) Učitavamo JSON
  fetch('series.json')
    .then(resp => resp.json())
    .then(raw => {
      // Transformišemo distance => mm
      allData = raw.map(item => {
        const distanceMm = Math.round(item.distance * 10);
        return {
          distanceMm,
          diameter: item.diameter,
          area_mm2: item.area_mm2
        };
      });

      // Skupimo sve dijametre (za Refine)
      allData.forEach(x => allDiameters.add(x.diameter));

      // Omogućimo +Add
      addCalcBtn.disabled = false;

      // 2) Load iz localStorage
      const loaded = loadStateFromLocalStorage();
      if (!loaded) {
        createInitialCalculator();
      }
    })
    .catch(err => console.error('Error loading JSON data:', err));

  // 2) Add New Calculation
  addCalcBtn.addEventListener('click', () => {
    const block = createCalculatorBlock();
    calcContainer.appendChild(block);

    block.dataset.area = '999999';
    block.dataset.isCollapsed = 'false';
    reorderBlocksByArea();
    saveAllCalculatorsToLocalStorage();
  });

  // 3) Reset All
  resetAllBtn.addEventListener('click', () => {
    localStorage.removeItem('calcBlocks');
    calcContainer.innerHTML = '';
    createInitialCalculator();  // Uvek ostaje bar 1 kalkulator
    // createInitialCalculator() će na kraju pozvati saveAllCalculatorsToLocalStorage
  });

  function createInitialCalculator() {
    const block = createCalculatorBlock();
    block.dataset.area = '999999';
    block.dataset.isCollapsed = 'false';
    calcContainer.appendChild(block);
    reorderBlocksByArea();
  }

  function reorderBlocksByArea() {
    const blocks = Array.from(calcContainer.children);
    blocks.sort((a, b) => parseInt(a.dataset.area) - parseInt(b.dataset.area));
    blocks.forEach(bl => calcContainer.appendChild(bl));
  }

  // Kreiramo 1 calc-block
  function createCalculatorBlock() {
    const block = document.createElement('div');
    block.classList.add('calc-block');

    const expandedDiv = document.createElement('div');
    const collapsedDiv = document.createElement('div');
    collapsedDiv.classList.add('collapsed-row','hidden');
    block.appendChild(expandedDiv);
    block.appendChild(collapsedDiv);

    // Title
    const title = document.createElement('div');
    title.classList.add('calc-title');
    title.textContent = 'Rebar Calculator';
    expandedDiv.appendChild(title);

    // FIRST iteration
    const firstIterationDiv = document.createElement('div');
    firstIterationDiv.classList.add('first-iteration');
    firstIterationDiv.innerHTML = `
      <label>Required Area (mm²/m):</label>
      <input type="number" id="areaInput" placeholder="e.g. 1500" />
      <button id="findBtn">Find</button>
      <ul id="firstResults"></ul>
    `;
    expandedDiv.appendChild(firstIterationDiv);

    const areaInput = firstIterationDiv.querySelector('#areaInput');
    const findBtn = firstIterationDiv.querySelector('#findBtn');
    const firstResultsUl = firstIterationDiv.querySelector('#firstResults');

    // Refine section (collapsible)
    const refineSection = document.createElement('div');
    refineSection.classList.add('refine-section');
    refineSection.innerHTML = `
      <div class="refine-header">
        Adjust search <span class="arrow">▼</span>
      </div>
      <div class="refine-body hidden">
        <label>Distance (mm):</label>
        <div class="select-wrapper">
          <select id="refineDistanceSelect">
            <option value="">Any distance</option>
          </select>
          <button class="clear-btn" id="clearDistanceBtn">x</button>
        </div>

        <label>Diameter (mm):</label>
        <div class="select-wrapper">
          <select id="refineDiameterSelect">
            <option value="">Any diameter</option>
          </select>
          <button class="clear-btn" id="clearDiameterBtn">x</button>
        </div>
        
        <ul id="refineResults"></ul>
      </div>
    `;
    expandedDiv.appendChild(refineSection);

    const refineHeader = refineSection.querySelector('.refine-header');
    const refineBody = refineSection.querySelector('.refine-body');
    const refineDistanceSelect = refineSection.querySelector('#refineDistanceSelect');
    const clearDistanceBtn = refineSection.querySelector('#clearDistanceBtn');
    const refineDiameterSelect = refineSection.querySelector('#refineDiameterSelect');
    const clearDiameterBtn = refineSection.querySelector('#clearDiameterBtn');
    const refineResultsUl = refineSection.querySelector('#refineResults');

    // Klik na "Adjust search"
    refineHeader.addEventListener('click', () => {
      refineBody.classList.toggle('hidden');
      const arrowSpan = refineHeader.querySelector('.arrow');
      arrowSpan.textContent = refineBody.classList.contains('hidden') ? '▼' : '▲';
    });

    // Collapse / Reopen / Delete
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = 'Save';
    collapseBtn.classList.add('btn','hidden', 'save');
    collapseBtn.style.marginTop = '10px';
    expandedDiv.appendChild(collapseBtn);

    const summarySpan = document.createElement('span');
    const reopenBtn = document.createElement('button');
    reopenBtn.textContent = '↓';
    reopenBtn.classList.add('btn','light-blue-btn');
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'X';
    deleteBtn.classList.add('btn','red-btn');

    collapsedDiv.appendChild(summarySpan);
    const rightBtnsDiv = document.createElement('div');
    rightBtnsDiv.appendChild(reopenBtn);
    rightBtnsDiv.appendChild(deleteBtn);
    collapsedDiv.appendChild(rightBtnsDiv);

    let userArea = 0;

    // Filtriramo i prečnike i distance (inicijalna pretraga)
    findBtn.addEventListener('click', () => {
      userArea = parseInt(areaInput.value, 10);
      if(!userArea || userArea <= 0){
        alert('Enter a valid area in mm²');
        return;
      }

      // Filtriramo po area >= userArea, ALLOWED_DIAMETERS, ALLOWED_DISTANCES
      let filtered = allData.filter(x =>
        x.area_mm2 >= userArea &&
        ALLOWED_DIAMETERS.includes(x.diameter) &&
        ALLOWED_DISTANCES.includes(x.distanceMm)
      );

      filtered.sort((a, b) => {
        const diffA = a.area_mm2 - userArea;
        const diffB = b.area_mm2 - userArea;
        if(diffA !== diffB) return diffA - diffB;
        return b.distanceMm - a.distanceMm;
      });

      const top5 = filtered.slice(0,5);
      renderResults(top5, firstResultsUl);

      if(top5.length > 0){
        collapseBtn.classList.remove('hidden');
      } else {
        collapseBtn.classList.add('hidden');
      }

      block.dataset.area = userArea.toString();
      reorderBlocksByArea();

      // U Refine i dalje imamo sve dijametre i distance
      setupRefineSelects();
      saveAllCalculatorsToLocalStorage();
    });

    function setupRefineSelects() {
      // Distances
      refineDistanceSelect.innerHTML = '<option value="">Any distance</option>';
      const distArr = Array.from(new Set(allData.map(x => x.distanceMm))).sort((a, b) => a - b);
      distArr.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        refineDistanceSelect.appendChild(opt);
      });
      clearDistanceBtn.style.display = 'none';

      // Diameters
      refineDiameterSelect.innerHTML = '<option value="">Any diameter</option>';
      const diamArr = Array.from(allDiameters).sort((a, b) => a - b);
      diamArr.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = d;
        refineDiameterSelect.appendChild(opt);
      });
      clearDiameterBtn.style.display = 'none';

      refineDistanceSelect.addEventListener('change', ()=>{
        toggleClearBtn(refineDistanceSelect, clearDistanceBtn);
        doRefine();
      });
      refineDiameterSelect.addEventListener('change', ()=>{
        toggleClearBtn(refineDiameterSelect, clearDiameterBtn);
        doRefine();
      });
      clearDistanceBtn.addEventListener('click', ()=>{
        refineDistanceSelect.value = '';
        toggleClearBtn(refineDistanceSelect, clearDistanceBtn);
        doRefine();
      });
      clearDiameterBtn.addEventListener('click', ()=>{
        refineDiameterSelect.value = '';
        toggleClearBtn(refineDiameterSelect, clearDiameterBtn);
        doRefine();
      });
    }

    function toggleClearBtn(selectEl, btnEl){
      if(selectEl.value){
        btnEl.style.display = 'block';
      } else {
        btnEl.style.display = 'none';
      }
    }

    function doRefine() {
      // U Adjust search => prikazujemo sve prečnike/distance
      let arr = allData.filter(x => x.area_mm2 >= userArea);

      const distVal = refineDistanceSelect.value;
      const diamVal = refineDiameterSelect.value;
      if(distVal){
        arr = arr.filter(x => x.distanceMm === Number(distVal));
      }
      if(diamVal){
        arr = arr.filter(x => x.diameter === Number(diamVal));
      }

      arr.sort((a, b) => {
        const diffA = a.area_mm2 - userArea;
        const diffB = b.area_mm2 - userArea;
        if(diffA !== diffB) return diffA - diffB;
        return b.distanceMm - a.distanceMm;
      });
      const top5 = arr.slice(0,5);
      renderResults(top5, firstResultsUl);

      saveAllCalculatorsToLocalStorage();
    }

    collapseBtn.addEventListener('click', () => {
      expandedDiv.classList.add('hidden');
      collapsedDiv.classList.remove('hidden');
      block.dataset.isCollapsed = 'true';

      fillSummary(summarySpan, userArea, firstResultsUl);
      saveAllCalculatorsToLocalStorage();
    });

    reopenBtn.addEventListener('click', () => {
      collapsedDiv.classList.add('hidden');
      expandedDiv.classList.remove('hidden');
      block.dataset.isCollapsed = 'false';
      saveAllCalculatorsToLocalStorage();
    });

    // Klik na X => brisanje
    deleteBtn.addEventListener('click', () => {
      block.remove();

      // Ako nema ni jednog blocka, kreiramo novi
      if (calcContainer.children.length === 0) {
        createInitialCalculator();
      }
      saveAllCalculatorsToLocalStorage();
    });

    return block;
  }

  function renderResults(list, ul) {
    ul.innerHTML = '';
    if(!list.length){
      ul.innerHTML='<li>No matching options found.</li>';
      return;
    }
    list.forEach((item, index)=>{
      const li = document.createElement('li');
      li.classList.add('result-item');
      li.innerHTML=`
        <span class="series-code">⌀${item.diameter}-${item.distanceMm}</span>
        => <span class="area-val">${item.area_mm2} mm²</span>
      `;
      if(index===0){
        li.classList.add('selected');
      }
      li.addEventListener('click',()=>{
        ul.querySelectorAll('li.selected').forEach(s=>s.classList.remove('selected'));
        li.classList.add('selected');
        saveAllCalculatorsToLocalStorage();
      });
      ul.appendChild(li);
    });
  }

  function fillSummary(summarySpan, userArea, ul) {
    let text = `Area=<span style="color:red; font-weight:bold;">${userArea} mm²</span>; Results: `;
    const selectedLi = ul.querySelector('li.selected');
    if(!selectedLi){
      text += 'No results.';
    } else {
      const fullText = selectedLi.textContent.trim();
      const parts = fullText.split(' => ');
      if(parts.length===2){
        text += `<span style="color:red; font-weight:bold;">${parts[0]}</span> => ${parts[1]}`;
      } else {
        text += `<span style="color:red; font-weight:bold;">${fullText}</span>`;
      }
    }
    summarySpan.innerHTML = text;
  }

  // LocalStorage - SAVE
  function saveAllCalculatorsToLocalStorage(){
    const blocks = Array.from(calcContainer.children);
    const toSave = blocks.map(block=>{
      const area = parseInt(block.dataset.area||'0',10);
      const isCollapsed = block.dataset.isCollapsed==='true';
      const selLi = block.querySelector('.first-iteration ul li.selected');
      const selectedText = selLi ? selLi.textContent.trim() : '';
      return { area, isCollapsed, selectedText };
    });
    localStorage.setItem('calcBlocks', JSON.stringify(toSave));

    // Posle svakog snimanja, ažuriramo vidljivost reset i export dugmadi
    updateUIButtonsVisibility();
  }

  // LocalStorage - LOAD
  function loadStateFromLocalStorage(){
    const stored = localStorage.getItem('calcBlocks');
    if(!stored) {
      updateUIButtonsVisibility();
      return false;
    }

    const arr = JSON.parse(stored);
    if(!Array.isArray(arr) || arr.length===0) {
      updateUIButtonsVisibility();
      return false;
    }

    arr.forEach(obj=>{
      const block = createCalculatorBlock();
      calcContainer.appendChild(block);

      block.dataset.area = obj.area.toString();
      block.dataset.isCollapsed = obj.isCollapsed?'true':'false';

      if(obj.area>0){
        const areaInput = block.querySelector('#areaInput');
        areaInput.value = obj.area;
        const findBtn = block.querySelector('#findBtn');
        findBtn.click();

        if(obj.selectedText){
          const lis = block.querySelectorAll('.first-iteration ul li');
          lis.forEach(li=>{
            if(li.textContent.trim()===obj.selectedText){
              li.classList.add('selected');
            } else {
              li.classList.remove('selected');
            }
          });
        }
      }

      if(obj.isCollapsed){
        const expandedDiv = block.querySelector('.calc-block > div:nth-child(1)');
        const collapsedDiv = block.querySelector('.collapsed-row');
        expandedDiv.classList.add('hidden');
        collapsedDiv.classList.remove('hidden');

        const summarySpan = collapsedDiv.querySelector('span');
        const firstResultsUl = block.querySelector('#firstResults');
        fillSummary(summarySpan, obj.area, firstResultsUl);
      }
    });

    reorderBlocksByArea();
    updateUIButtonsVisibility();
    return true;
  }

  // Pokaži ili sakrij dugmad "Reset All" i "Export"
  function updateUIButtonsVisibility() {
    const stored = localStorage.getItem('calcBlocks');
    if(!stored) {
      resetAllBtn.classList.add('hidden');
      exportBtn.classList.add('hidden');
      return;
    }
    const arr = JSON.parse(stored);
    if(!Array.isArray(arr) || arr.length === 0) {
      resetAllBtn.classList.add('hidden');
      exportBtn.classList.add('hidden');
    } else {
      resetAllBtn.classList.remove('hidden');
      exportBtn.classList.remove('hidden');
    }
  }

  //////////////////////////////////////////////////////////////////////////
  //               MODAL za Export + Import (Drag & Drop)                  //
  //////////////////////////////////////////////////////////////////////////

  // EXPORT - otvaramo modal
  exportBtn.addEventListener('click', () => {
    // default je prazno polje
    exportFileNameInput.value = "";
    modalOverlay.classList.remove('hidden');
  });

  // CANCEL - sakrij modal
  modalCancelBtn.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
  });

  // OK - uzmemo ime fajla i exportujemo
  modalOkBtn.addEventListener('click', () => {
    const userFileName = exportFileNameInput.value.trim() || 'untitled';
    exportCalcBlocks(userFileName);
    modalOverlay.classList.add('hidden');
  });

  function exportCalcBlocks(fileName) {
    const dataStr = localStorage.getItem('calcBlocks') || '[]';
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Napravimo <a> i simuliramo klik
    const a = document.createElement('a');
    a.href = url;
    // Ako user nije dodao .json, mi ga dodajemo
    a.download = fileName.endsWith('.json') ? fileName : (fileName + '.json');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // IMPORT (Input file)
  importBtn.addEventListener('click', () => {
    importInput.click();
  });

  importInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      importCalcBlocksFromFile(file);
      importInput.value = '';
    }
  });

  function importCalcBlocksFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        localStorage.setItem('calcBlocks', JSON.stringify(jsonData));
        resetAllAndLoad();
      } catch (err) {
        alert('Invalid JSON format!');
      }
    };
    reader.readAsText(file);
  }

  // DRAG & DROP (opciono)
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      importCalcBlocksFromFile(e.dataTransfer.files[0]);
    }
  });

  function resetAllAndLoad() {
    calcContainer.innerHTML = '';
    loadStateFromLocalStorage();
  }
});
