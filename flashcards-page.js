// flashcards-page.js

import { auth, db } from './firebase-config.js';
import { collection, doc, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarFlashcardsAsync, responderFlashcard, getUsageLimits, excluirItem, regenerarItem } from './api.js';
import { state } from './main-app.js';

// ELEMENTOS DOM
const btnCriarDeck = document.getElementById('btn-criar-deck');
const containerFormDeck = document.getElementById('container-form-deck');
const historicoDecks = document.getElementById('historico-decks');
const usageCounterDiv = document.getElementById('usage-counter');
const estudoContainer = document.getElementById('flashcard-estudo');

let unsubDecks = null;
let filaCartoes = [];
let deckAberto = null;
let ultimoDeckSolicitado=null;

function showToast(message, type='success', duration=5000){
  const toast=document.createElement('div');
  toast.className=`feedback-toast ${type}`;
  toast.textContent=message;
  document.body.appendChild(toast);
  setTimeout(()=>toast.classList.add('show'),10);
  setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),500);},duration);
}

// Função para obter data atual em Brasília
function getDataBrasilia() {
  return new Date().toLocaleString("pt-BR", {timeZone: "America/Sao_Paulo"});
}

// Função para formatar datas
function formatarData(data) {
  if (!data) return 'Data desconhecida';
  
  const dataObj = data.toDate ? data.toDate() : new Date(data);
  return dataObj.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo'
  });
}

// Função para calcular dias desde uma data
function calcularDiasDesde(data) {
  if (!data) return 0;
  
  const dataObj = data.toDate ? data.toDate() : new Date(data);
  const hoje = new Date();
  
  // Simplificar o cálculo usando UTC para evitar problemas de fuso horário
  const hojeUTC = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dataUTC = new Date(dataObj.getFullYear(), dataObj.getMonth(), dataObj.getDate());
  
  const diffTime = hojeUTC - dataUTC;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Função para calcular próxima revisão
function calcularProximaRevisao(cards) {
  if (!cards || cards.length === 0) return null;
  
  const cardsComPrazo = cards.filter(c => c.nextReview && c.nextReview.toDate() > new Date());
  if (cardsComPrazo.length === 0) return null;
  
  const proximaRevisao = cardsComPrazo
    .sort((a, b) => a.nextReview.toDate() - b.nextReview.toDate())[0]
    .nextReview.toDate();
  
  return proximaRevisao;
}

function renderHistorico(decks){
  if(!historicoDecks)return;
  if(decks.length===0){historicoDecks.innerHTML='<p>Nenhum deck ainda.</p>';return;}
  
  // Função para calcular status de revisão
  const calcularStatusRevisao = async (deckId) => {
    try {
      const q = query(collection(db, `users/${auth.currentUser.uid}/flashcards/${deckId}/cards`));
      const snap = await getDocs(q);
      const cards = snap.docs.map(d => ({id: d.id, ...d.data()}));
      
      const totalCards = cards.length;
      if (totalCards === 0) return null;
      
      // Verificar se há cartões com nextReview definido (já foram estudados)
      const cardsComPrazo = cards.filter(c => c.nextReview);
      const deckEstudado = cardsComPrazo.length > 0;
      
              // CORREÇÃO: Primeiro verificar se é um deck novo (nunca foi estudado)
        if (!deckEstudado) {
          return {
          tipo: 'novo',
          texto: `${totalCards} cartões aguardando início dos estudos`,
          cor: '#059669',
          bg: '#f0fdf4'
        };
      }
      
      // Se chegou aqui, o deck já foi estudado. Agora verificar cartões para revisar
      const cardsParaRevisar = cards.filter(c => c.nextReview && c.nextReview.toDate() <= new Date());
      
      if (cardsParaRevisar.length > 0) {
        return {
          tipo: 'revisao',
          texto: `${cardsParaRevisar.length} cartões aguardando revisão`,
          cor: '#dc2626',
          bg: '#fef2f2'
        };
      } else {
        // Deck já foi estudado, mas está aguardando prazo
        const proximosCards = cards
          .filter(c => c.nextReview && c.nextReview.toDate() > new Date())
          .sort((a, b) => a.nextReview.toDate() - b.nextReview.toDate());
        
        if (proximosCards.length > 0) {
          const proximaRevisao = proximosCards[0].nextReview.toDate();
          const hoje = new Date();
          const diffTime = proximaRevisao - hoje;
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          return {
            tipo: 'proximo',
            texto: `${proximosCards.length} cartões aguardando o prazo da próxima revisão`,
            cor: '#d97706',
            bg: '#fef3c7'
          };
        }
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao calcular status de revisão:', error);
      return null;
    }
  };
  
  // Renderizar decks com status de revisão
  const renderizarDecksComStatus = async () => {
    const decksHtml = await Promise.all(decks.map(async (deck) => {
      const statusIcon = deck.status==='processing'?'<i class="fas fa-spinner fa-spin"></i>':deck.status==='failed'?'<i class="fas fa-exclamation-triangle" style="color:#ef4444"></i>':'';
      const btnLabel = deck.status==='processing'? 'Gerando...' : deck.status==='failed'? 'Falhou' : 'Estudar';
      const s=deck.stats||{};
      const totalStats=(s.q0||0)+(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0);
      const perc= totalStats? Math.round(((s.q4||0)+(s.q5||0))*100/totalStats):0;
      const percHtml= totalStats? `<span class='badge-accuracy'>${perc}% fácil</span>`:'';
      
      // Informações de data e tempo
      const dataCriacao = formatarData(deck.criadoEm);
      const diasDesdeCriacao = calcularDiasDesde(deck.criadoEm);
      const diasTexto = diasDesdeCriacao === 0 ? 'hoje' : 
                       diasDesdeCriacao === 1 ? 'ontem' : 
                       `${diasDesdeCriacao} dias atrás`;
      
      // Informações de próxima revisão
      let proximaRevisaoHtml = '';
      if (deck.status === 'completed') {
        try {
          const q = query(collection(db, `users/${auth.currentUser.uid}/flashcards/${deck.deckId}/cards`));
          const snap = await getDocs(q);
          const cards = snap.docs.map(d => ({id: d.id, ...d.data()}));
          const proximaRevisao = calcularProximaRevisao(cards);
          
          if (proximaRevisao) {
            const hoje = new Date();
            const diffTime = proximaRevisao - hoje;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 0) {
              proximaRevisaoHtml = '<span style="color: #dc2626; font-size: 0.8rem;"><i class="fas fa-exclamation-circle"></i> Revisão hoje</span>';
            } else if (diffDays === 1) {
              proximaRevisaoHtml = '<span style="color: #d97706; font-size: 0.8rem;"><i class="fas fa-clock"></i> Próxima revisão amanhã</span>';
            } else {
              proximaRevisaoHtml = `<span style="color: #6b7280; font-size: 0.8rem;"><i class="fas fa-calendar"></i> Próxima revisão em ${diffDays} dias</span>`;
            }
          }
        } catch (error) {
          console.error('Erro ao calcular próxima revisão:', error);
        }
      }
      
      let statusRevisaoHtml = '';
      if (deck.status === 'completed') {
        const statusRevisao = await calcularStatusRevisao(deck.deckId);
        if (statusRevisao) {
          const iconMap = {
            'revisao': 'clock',
            'proximo': 'clock',
            'novo': 'play'
          };
          statusRevisaoHtml = `<span class='badge-revisao' style='background:${statusRevisao.bg};color:${statusRevisao.cor};padding:2px 6px;border-radius:12px;font-size:0.75rem;margin-left:6px;'><i class="fas fa-${iconMap[statusRevisao.tipo]}"></i> ${statusRevisao.texto}</span>`;
        }
      }
      
      return `<div class="plano-item">
        <div>
          <h3>${deck.materia||'Deck'} ${statusIcon} ${percHtml} ${statusRevisaoHtml}</h3>
          <p>${deck.topico||''} • ${deck.cardCount||0} cards</p>
          <p style="font-size: 0.8rem; color: #6b7280; margin-top: 4px;">
            <i class="fas fa-calendar-plus"></i> Criado ${dataCriacao} (${diasTexto})
            ${proximaRevisaoHtml ? '<br>' + proximaRevisaoHtml : ''}
          </p>
        </div>
        <div class="plano-actions">
          <button class="btn btn-primary btn-abrir-deck" data-id="${deck.deckId}" ${deck.status!=='completed'?'disabled':''}>${btnLabel}</button>
          ${deck.status !== 'processing' ? `
            <div class="action-buttons">
              ${deck.status === 'failed' ? `
                <button class="btn btn-outline btn-regenerar" data-id="${deck.deckId}" title="Regenerar deck">
                  <i class="fas fa-redo"></i>
                </button>
              ` : ''}
              <button class="btn btn-outline btn-excluir" data-id="${deck.deckId}" title="Excluir deck">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          ` : ''}
        </div>
      </div>`;
    }));
    
    historicoDecks.innerHTML = decksHtml.join('');
  };
  
  renderizarDecksComStatus();
}

function ouvirDecks(){
  if(unsubDecks)unsubDecks();
  const q=query(collection(db,`users/${auth.currentUser.uid}/flashcards`),orderBy('criadoEm','desc'));
  unsubDecks = onSnapshot(q,snap=>{
    const decks=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderHistorico(decks);
    snap.docChanges().forEach(change=>{
       if(change.type==='modified'){
         const d=change.doc.data();
         if(d.status==='completed' && d.deckId===ultimoDeckSolicitado){
            showToast('✅ Deck de flashcards pronto!','success',6000);
            ultimoDeckSolicitado=null;
            // O botão já será renderizado com "Estudar" pela função renderHistorico
         }
       }
    });
  });
}

async function renderUsageInfo(){
  if(!auth.currentUser||!usageCounterDiv)return;
  try{
     const data=await getUsageLimits(auth.currentUser.uid);
     const uso=data.usage.flashcards||0;
     const limite=data.limits.flashcards||0;
     const restantes=limite-uso;
     const plano=data.plan;
     const msg= plano==='trial'?`Você ainda pode gerar ${restantes} de ${limite} decks de flashcards durante o teste.`:`Hoje, você ainda pode gerar ${restantes} de ${limite} decks de flashcards.`;
     usageCounterDiv.textContent=msg;
     usageCounterDiv.style.display='block';
     if(btnCriarDeck)btnCriarDeck.disabled=restantes<=0;
  }catch(e){console.error('Erro usage flashcards',e);usageCounterDiv.style.display='none';}
}

function mostrarFormDeck(){
  containerFormDeck.innerHTML=`<form id="form-deck"><div class="form-field-group"><label>Matéria</label><input type="text" id="deck-materia" placeholder="Ex: Direito Administrativo" required></div><div class="form-field-group"><label>Tópico</label><input type="text" id="deck-topico" placeholder="Ex: Controle de Constitucionalidade" required></div><div class="form-field-group"><label>Quantidade de cards</label><input type="number" id="deck-quantidade" min="3" max="20" value="10"><small style="color: #6b7280; font-size: 0.875rem; margin-top: 4px; display: block;"><i class="fas fa-info-circle"></i> Limite de 3 a 20 cards por deck</small></div><div class="form-actions"><button type="submit" class="btn btn-primary">Gerar Flashcards</button><button type="button" id="btn-cancelar-deck" class="btn btn-ghost">Cancelar</button></div></form>`;
  containerFormDeck.style.display='block';
}

btnCriarDeck?.addEventListener('click',()=>mostrarFormDeck());

containerFormDeck?.addEventListener('click',async e=>{
  if(e.target.id==='btn-cancelar-deck'){
    containerFormDeck.style.display='none';
    containerFormDeck.innerHTML='';
  }
});

containerFormDeck?.addEventListener('submit',async e=>{
  if(e.target.id!=='form-deck')return;
  e.preventDefault();
  const materia=document.getElementById('deck-materia').value;
  const topico=document.getElementById('deck-topico').value;
  const quantidade=parseInt(document.getElementById('deck-quantidade').value,10);
  
  // Validação da quantidade
  if(quantidade < 3 || quantidade > 20) {
    showToast('Por favor, insira uma quantidade de cards entre 3 e 20.', 'error');
    return;
  }
  
  if(!window.processingUI){showToast('Sistema de processamento indisponível','error');return;}
  window.processingUI.startProcessingWithConfirmation({
    confirmationTitle:'Gerar Deck',
    confirmationMessage:'Gerar flashcards por IA?',
    confirmationIcon:'fas fa-clone',
    processingTitle:'Gerando Deck...',
    processingMessage:'A IA está criando seus flashcards.',
    estimatedTime:'15-30 segundos',
    resultAreaSelector:'#historico-decks',
    onConfirm:async()=>{
      showToast('Deck solicitado! Gerando...','info',3000);
      const resp=await gerarFlashcardsAsync({userId:auth.currentUser.uid,materia,topico,quantidade});
      ultimoDeckSolicitado=resp.deckId;
      return resp;
    },
    onComplete:()=>{
      containerFormDeck.style.display='none';
      containerFormDeck.innerHTML='';
      renderUsageInfo();
    }
  });
});

document.addEventListener('DOMContentLoaded',()=>{
  auth.onAuthStateChanged(user=>{if(user){ouvirDecks();renderUsageInfo();}});
});

// Event listeners para botões de ação dos flashcards
document.body.addEventListener('click', async (e) => {
  const btnExcluir = e.target.closest('.btn-excluir');
  const btnRegenerar = e.target.closest('.btn-regenerar');
  
  if (btnExcluir) {
    const deckId = btnExcluir.dataset.id;
    const confirmed = await window.confirmCustom({
      title: 'Excluir Deck',
      message: 'Tem certeza que deseja excluir este deck de flashcards?',
      confirmText: 'Excluir',
      cancelText: 'Cancelar',
      confirmClass: 'btn-danger',
      icon: 'fas fa-trash'
    });
    
    if (confirmed) {
      try {
        btnExcluir.disabled = true;
        btnExcluir.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        await excluirItem(auth.currentUser.uid, 'flashcards', deckId);
        showToast("Deck excluído com sucesso!", "success");
        
      } catch (error) {
        console.error("Erro ao excluir deck:", error);
        showToast("Erro ao excluir deck. Tente novamente.", "error");
        btnExcluir.disabled = false;
        btnExcluir.innerHTML = '<i class="fas fa-trash"></i>';
      }
    }
  }
  
  if (btnRegenerar) {
    const deckId = btnRegenerar.dataset.id;
    const confirmed = await window.confirmCustom({
      title: 'Regenerar Deck',
      message: 'Tem certeza que deseja regenerar este deck de flashcards?',
      confirmText: 'Regenerar',
      cancelText: 'Cancelar',
      confirmClass: 'btn-primary',
      icon: 'fas fa-redo'
    });
    
    if (confirmed) {
      try {
        btnRegenerar.disabled = true;
        btnRegenerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        const result = await regenerarItem(auth.currentUser.uid, 'flashcards', deckId);
        showToast("Deck regenerado! Aguarde o processamento...", "success");
        
      } catch (error) {
        console.error("Erro ao regenerar deck:", error);
        showToast("Erro ao regenerar deck. Tente novamente.", "error");
        btnRegenerar.disabled = false;
        btnRegenerar.innerHTML = '<i class="fas fa-redo"></i>';
      }
    }
  }
});

function mostrarCartao(){
  if(filaCartoes.length===0){
    estudoContainer.innerHTML='<p>✅ Revisão concluída por hoje!</p>';
    return;
  }
  const card = filaCartoes[0];
  estudoContainer.innerHTML=`<div class="feature-card"><h4>Frente</h4><p>${card.frente}</p><button class="btn btn-primary" id="btn-mostrar-resposta">Mostrar Resposta</button></div>`;
}

estudoContainer?.addEventListener('click',async e=>{
  if(e.target.id==='btn-mostrar-resposta'){
    const card=filaCartoes[0];
    estudoContainer.innerHTML=`<div class="feature-card flashcard"><h4>Resposta</h4><p>${card.verso}</p><p style="font-size:0.85rem;color:#6b7280;margin-top:12px;">Avalie sua lembrança: 0 = Errei &nbsp; … &nbsp; 5 = Muito fácil</p><div class="form-actions"><button class="btn btn-outline btn-quality" data-q="0">0</button><button class="btn btn-outline btn-quality" data-q="1">1</button><button class="btn btn-outline btn-quality" data-q="2">2</button><button class="btn btn-outline btn-quality" data-q="3">3</button><button class="btn btn-outline btn-quality" data-q="4">4</button><button class="btn btn-outline btn-quality" data-q="5">5</button></div></div>`;
  }
  if(e.target.classList.contains('btn-quality')){
    const qualidade=parseInt(e.target.dataset.q,10);
    const card=filaCartoes.shift();
    try {
      await responderFlashcard({userId:auth.currentUser.uid,deckId:deckAberto,cardId:card.id,quality:qualidade});
      document.dispatchEvent(new CustomEvent('flashcardReviewed',{detail:{quality:qualidade}}));
      mostrarCartao();
    } catch (error) {
      console.error(`[DEBUG] Erro ao responder flashcard:`, error);
    }
  }
});

historicoDecks?.addEventListener('click',async e=>{
  const btn=e.target.closest('.btn-abrir-deck');
  if(!btn)return;
  const deckId=btn.dataset.id;
  deckAberto=deckId;
  // busca cards para revisão
  const q=query(collection(db,`users/${auth.currentUser.uid}/flashcards/${deckId}/cards`));
  const snap=await getDocs(q);
  filaCartoes=snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>!c.nextReview||c.nextReview.toDate()<=new Date());
  if(filaCartoes.length===0){showToast('Nenhum cartão para revisar hoje','info');return;}
  estudoContainer.style.display='block';
  estudoContainer.scrollIntoView({behavior:'smooth'});
  mostrarCartao();
}); 

// helper to render card html (mantido para compatibilidade)
function cardHtml(deck){
  const s=deck.stats||{};
  const totalStats=(s.q0||0)+(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0);
  const perc= totalStats? Math.round(((s.q4||0)+(s.q5||0))*100/totalStats):0;
  const percHtml= totalStats? `<span class='badge-accuracy'>${perc}% fácil</span>`:'';
  const statusIcon= deck.status==='processing'?'<i class="fas fa-spinner fa-spin"></i>':deck.status==='failed'?'<i class="fas fa-exclamation-triangle" style="color:#ef4444"></i>':'';
  
  let btnLabel = 'Estudar';
  if (deck.status === 'processing') {
      btnLabel = 'Gerando...';
  } else if (deck.status === 'failed') {
      btnLabel = 'Falhou';
  } else if (totalStats > 0) {
      btnLabel = 'Rever';
  }

  return `<div class="plano-item"><div><h3>${deck.materia||'Deck'} ${statusIcon} ${percHtml}</h3><p>${deck.topico||''} • ${deck.cardCount||0} cards</p></div><button class="btn btn-primary btn-abrir-deck" data-id="${deck.deckId}" ${deck.status!=='completed'?'disabled':''}>${btnLabel}</button></div>`;
} 