import { gammaln, betai, gammaq, pFromT, pFromF, pFromChi, pFromZ } from "./pvalue";

/* v1's statistics maths, the rest of S1: the assumption checks (index.html:8691-8752: stkNormCdf, stkQnorm, stkPoly, stkShapiro, stkBrownForsythe), the two-way ANOVA and least
   squares (8834-8893: stkRSS, stkAnova2, stkOLS), logistic regression and its AUC (8942-8990: stkLogit, stkAUC), the power simulator's generator, normal draw and runs (8991-9005: plRng,
   plNorm, plSim), power (9044-9123: pwLogPois, pwNcChiSf, pwNcFSf, pwNctCdf, pwChiCrit, pwPowerT, pwPowerF, pwPower, pwSolveN, pwSolveEffect, and stkSimpleEffects), and the helpers of
   the 2026-10-07 batches (9124-9347: smean, svar, ssd, smedian, ranks, stkTCrit, stkFQuant, stkTieTerm, stkHolm, stkKruskal, stkDunn, stkSpearman, stkCorrMat, stkOmega, stkAlpha, stkRng,
   stkOmegaBoot, STK_GL, stkGL, stkPhi, stkPtukey, stkQtukey, stkWelchAnova, stkGamesHowell, stkLogChoose, stkFisherRC, stkFisher2x2, stkExactMW, stkExactSR, stkBinomTwo).
   Not here: 8753-8833 and 8894-8941 (page-bound), 9006-9043 (plPreset, plRun), and TUKEY_Q05 / qCrit (11858-11883: defined, never called; register row F21).
   The arithmetic is v1's as v1 wrote it, line for line: the same operation order, literals, loop bounds (stkQnorm's 200 and stkFQuant's 300 bisections, stkOmega's 500 and 300
   iterations and its 0.995 cap, stkLogit's 100 Newton steps with 30 halvings and its separation cut-offs |b| > 30 and SE > 500 (register row F12), stkFisherRC's default limit of
   30,000,000 tables), seeds and Math.imul mixers (plRng and stkRng, closures over `|0` arithmetic; stkOmegaBoot's seed 12345, register row D-W2-1), branch order and early returns, so on
   the engine that runs v1 the functions return v1's doubles to the last bit; test/golden/statsmath.test.ts compares them with Object.is on the platform that captured the fixture and
   within a relative 1e-12 elsewhere (register row D-W1-16). STK_GL is computed once, at module load, by v1's IIFE. Correlation power uses Fisher's z, as v1 does (register row F19).
   What differs from v1's text is only what TypeScript and this package's lint need:
   - parameter and return types, the exported types below, `export` on every function and on STK_GL;
   - `const` or `let` where v1 wrote `var` (the no-var rule), in the same order: a `var` list that mixes bindings kept and bindings reassigned is split into consecutive `const` and `let`
     statements in the order of the list (stkShapiro, stkBrownForsythe, stkRSS, stkAnova2, stkOLS, stkLogit, stkAUC, pwNcChiSf, pwNcFSf, pwNctCdf, pwSolveEffect, stkSimpleEffects,
     stkFisherRC), and plSim's `let m1=0,m2=0,a=...,b=...` is split the same way (the prefer-const rule: a and b are never reassigned); a `var` that v1's nested functions share with their parent (stkAnova2's i and k, stkOLS's and stkLogit's i, j, r, c) stays one `let` of the parent, so the loops still
     share their counters; a `var` declared inside a loop body becomes a block-scoped `let` or `const` there, which changes nothing because v1 assigns each one before reading it in the same
     pass (stkLogit's `var s2=1,nb,nl` is reassigned by the halving loop before it is read, so nb and nl carry the definite-assignment `!`);
   - bindings v1 declares and never reads are dropped (the no-unused-vars rule): stkShapiro's `j` and `small=1e-19`, stkRSS's `b=[]`, stkAnova2's `j`, pwNctCdf's `p` and `q`;
   - `[].concat(...)` and `[].concat.apply([],...)` start from `([] as number[])` (an empty literal is `never[]` to TypeScript);
   - `!` on indexed reads (noUncheckedIndexedAccess) and where flow analysis cannot see a value that v1's control flow guarantees (stkLogit's Hinv after its loop, pwPower's
     spec.effect, spec.k, spec.p and spec.df, which v1 reads unchecked, and stkFisherRC's limit inside its nested rec, where the narrowing of `limit=limit||30000000` does not reach);
   - stkDunn's pairs are typed with `padj` (v1 adds it after the push) and stkAnova2's effect rows as tuples, both by a type assertion that changes nothing at run time. */

export type Anova2Row = { id: "A" | "B" | "AB"; ss: number; df: number; ms: number; F: number; p: number; eta: number };
export type Anova2 = { sse: number; dfe: number; mse: number; sst: number; rows: Anova2Row[] };
export type Ols = { beta: number[]; inv: number[][]; resid: number[]; sse: number; sst: number; n: number; k: number };
export type LogitFit = { beta: number[]; se: number[]; inv: number[][]; ll: number; ll0: number; pr: number[]; iter: number; conv: boolean; sep: boolean; n1: number };
export type Logit = { singular: true } | { sep: true } | LogitFit;
export type Eff = { ss: number; df: number; F: number; p: number };
export type SimRun = { d: number; p: number; sig: boolean };
export type PowerTest = "ind" | "paired" | "one" | "anova" | "regr" | "chisq" | "corr";
export type PowerSpec = { test: PowerTest; alpha: number; effect?: number; tails?: number; k?: number; p?: number; df?: number };
export type Kruskal = { H: number; df: number; p: number; N: number; k: number; meanRanks: number[]; eps2: number; T: number };
export type DunnPair = { i: number; j: number; z: number; p: number; padj: number };
export type Spearman = { rho: number; n: number; df: number; p: number; lo: number; hi: number };
export type Omega = { omega: number; loadings: number[] };
export type Welch = { F: number; df1: number; df2: number; p: number; omega2: number; N: number; k: number };
export type GamesHowellPair = { i: number; j: number; diff: number; se: number; df: number; q: number; p: number; lo: number; hi: number };
export type FisherRC = { p: number; tables: number; total: number };

/* ---------- Assumption checks (Version 9) ---------- */
export function stkNormCdf(z: number): number {return z>=0?1-0.5*pFromZ(z):0.5*pFromZ(-z)}
export function stkQnorm(p: number): number {let lo=-40,hi=40,m,i;for(i=0;i<200;i++){m=(lo+hi)/2;if(stkNormCdf(m)<p)lo=m;else hi=m}return (lo+hi)/2}
export function stkPoly(c: number[], x: number): number {let r=0,i;for(i=c.length-1;i>=0;i--)r=r*x+c[i]!;return r}
/* Shapiro-Wilk W and p, Royston (1995) algorithm AS R94, as implemented in R. Returns null when n<3 or n>5000 or no range. */
export function stkShapiro(x0: number[]): { W: number; p: number; n: number } | null {
  const x=x0.slice().sort(function(a,b){return a-b}),n=x.length,nn2=Math.floor(n/2);let i;
  if(n<3||n>5000)return null;
  if(x[n-1]!-x[0]!<1e-19)return null;
  const c1=[0,.221157,-.147981,-2.07119,4.434685,-2.706056],c2=[0,.042981,-.293762,-1.752461,5.682633,-3.582633],
      g=[-2.273,.459],c3=[.544,-.39978,.025054,-6.714e-4],c4=[1.3822,-.77857,.062767,-.0020322],
      c5=[-1.5861,-.31082,-.083751,.0038915],c6=[-.4803,-.082676,.0030302];
  const a=new Array<number>(nn2+1),pi6=1.90985931710274,stqr=1.04719755119660;
  if(n===3){a[1]=Math.SQRT1_2}
  else{
    const an25=n+.25;let summ2=0;const m=new Array<number>(nn2+1);
    for(i=1;i<=nn2;i++){m[i]=stkQnorm((i-.375)/an25);summ2+=m[i]!*m[i]!}
    summ2*=2;const ssumm2=Math.sqrt(summ2),rsn=1/Math.sqrt(n);
    const a1=stkPoly(c1,rsn)-m[1]!/ssumm2;let i1,fac;
    if(n>5){
      i1=3;
      const a2=-m[2]!/ssumm2+stkPoly(c2,rsn);
      fac=Math.sqrt((summ2-2*m[1]!*m[1]!-2*m[2]!*m[2]!)/(1-2*a1*a1-2*a2*a2));
      a[2]=a2;
    }else{
      i1=2;
      fac=Math.sqrt((summ2-2*m[1]!*m[1]!)/(1-2*a1*a1));
    }
    a[1]=a1;
    for(i=i1;i<=nn2;i++)a[i]=-m[i]!/fac;
  }
  let mx=0,ssx=0,num=0;
  for(i=0;i<n;i++)mx+=x[i]!;mx/=n;
  for(i=0;i<n;i++){ssx+=(x[i]!-mx)*(x[i]!-mx);
    const ai=i<nn2?-a[i+1]!:(i>=n-nn2?a[n-i]!:0);num+=ai*x[i]!}
  const w=Math.min(1,num*num/ssx),w1=Math.max(1e-300,1-w);let pw;
  if(n===3){
    pw=pi6*(Math.asin(Math.sqrt(w))-stqr);if(!(pw>0))pw=0;if(pw>1)pw=1;
    return{W:w,p:pw,n:n};
  }
  let y=Math.log(w1);const xx2=Math.log(n);let mm,ss;
  if(n<=11){
    const gamma=stkPoly(g,n);
    if(y>=gamma)return{W:w,p:1e-99,n:n};
    y=-Math.log(gamma-y);mm=stkPoly(c3,n);ss=Math.exp(stkPoly(c4,n));
  }else{
    mm=stkPoly(c5,xx2);ss=Math.exp(stkPoly(c6,xx2));
  }
  pw=0.5*pFromZ((y-mm)/ss);if((y-mm)/ss<0)pw=1-pw;
  return{W:w,p:pw,n:n};
}
/* Brown-Forsythe: one-way ANOVA on absolute deviations from each group median. */
export function stkBrownForsythe(groups: number[][]): { F: number; df1: number; df2: number; p: number } | null {
  const ds=groups.map(function(g){const md=smedian(g);return g.map(function(v){return Math.abs(v-md)})});
  const all=([] as number[]).concat.apply([],ds),N=all.length,k=ds.length,gm=smean(all);let ssb=0,ssw=0;
  ds.forEach(function(d){const m=smean(d);ssb+=d.length*(m-gm)*(m-gm);d.forEach(function(v){ssw+=(v-m)*(v-m)})});
  if(!(ssw>0)||N-k<1)return null;
  const F=(ssb/(k-1))/(ssw/(N-k));
  return{F:F,df1:k-1,df2:N-k,p:pFromF(F,k-1,N-k)};
}

export function stkRSS(cols: number[][], y: number[]): number | null {
  const p=cols.length,n=y.length;let i,j,k;const A: number[][]=[];
  for(i=0;i<p;i++){A.push(new Array<number>(p+1));for(j=0;j<p;j++){let t=0;for(k=0;k<n;k++)t+=cols[i]![k]!*cols[j]![k]!;A[i]![j]=t}
    let t2=0;for(k=0;k<n;k++)t2+=cols[i]![k]!*y[k]!;A[i]![p]=t2}
  const scale=A.map(function(r,ix){return Math.abs(r[ix]!)||1});
  for(i=0;i<p;i++){
    let piv=i;for(j=i+1;j<p;j++)if(Math.abs(A[j]![i]!)>Math.abs(A[piv]![i]!))piv=j;
    if(Math.abs(A[piv]![i]!)<1e-9*scale[i]!)return null;
    const tmp=A[i]!;A[i]=A[piv]!;A[piv]=tmp;const sc=scale[i]!;scale[i]=scale[piv]!;scale[piv]=sc;
    for(j=i+1;j<p;j++){const f=A[j]![i]!/A[i]![i]!;for(k=i;k<=p;k++)A[j]![k]!-=f*A[i]![k]!}
  }
  const beta=new Array<number>(p);
  for(i=p-1;i>=0;i--){let sm=A[i]![p]!;for(j=i+1;j<p;j++)sm-=A[i]![j]!*beta[j]!;beta[i]=sm/A[i]![i]!}
  let rss=0;
  for(k=0;k<n;k++){let fit=0;for(i=0;i<p;i++)fit+=beta[i]!*cols[i]![k]!;rss+=(y[k]!-fit)*(y[k]!-fit)}
  return rss;
}
/* Type III two-way between-subjects ANOVA with sum-to-zero (effect) coding. a, b: level indices per observation. */
export function stkAnova2(y: number[], a: number[], b: number[], la: number, lb: number): Anova2 | null {
  const n=y.length;let k: number,i: number;
  function eff(lv: number[],nl: number){const cs: number[][]=[];for(i=0;i<nl-1;i++){const c=new Array<number>(n);for(k=0;k<n;k++)c[k]=lv[k]===i?1:(lv[k]===nl-1?-1:0);cs.push(c)}return cs}
  const ca=eff(a,la),cb=eff(b,lb),cab: number[][]=[];
  ca.forEach(function(x){cb.forEach(function(z){const c=new Array<number>(n);for(k=0;k<n;k++)c[k]=x[k]!*z[k]!;cab.push(c)})});
  const one=new Array<number>(n);for(k=0;k<n;k++)one[k]=1;
  const full=[one].concat(ca,cb,cab),rF=stkRSS(full,y);
  const rA=stkRSS([one].concat(cb,cab),y),rB=stkRSS([one].concat(ca,cab),y),rAB=stkRSS([one].concat(ca,cb),y);
  if(rF===null||rA===null||rB===null||rAB===null)return null;
  const dfe=n-la*lb;if(dfe<1)return null;
  const mean=smean(y);let sst=0;y.forEach(function(v){sst+=(v-mean)*(v-mean)});
  const mse=rF/dfe,out: Anova2={sse:rF,dfe:dfe,mse:mse,sst:sst,rows:[]};
  ([['A',rA-rF,la-1],['B',rB-rF,lb-1],['AB',rAB-rF,(la-1)*(lb-1)]] as Array<[Anova2Row["id"], number, number]>).forEach(function(e){
    const ss=Math.max(0,e[1]),df=e[2],F=(ss/df)/mse;
    out.rows.push({id:e[0],ss:ss,df:df,ms:ss/df,F:F,p:pFromF(F,df,dfe),eta:ss/(ss+rF)});
  });
  return out;
}

/* ---------- Multiple regression (Version 11) ---------- */
/* Ordinary least squares with an intercept. xs: array of predictor columns. Returns null when the predictors are linearly dependent. */
export function stkOLS(xs: number[][], y: number[]): Ols | null {
  const n=y.length,k=xs.length,p=k+1,cols: number[][]=[];let i,j: number,r: number,c;
  const one=new Array<number>(n);for(r=0;r<n;r++)one[r]=1;cols.push(one);xs.forEach(function(x){cols.push(x)});
  const M: number[][]=[];
  for(i=0;i<p;i++){M.push(new Array<number>(2*p));for(j=0;j<p;j++){let t=0;for(r=0;r<n;r++)t+=cols[i]![r]!*cols[j]![r]!;M[i]![j]=t}
    for(j=0;j<p;j++)M[i]![p+j]=i===j?1:0}
  const sc=M.map(function(row,ix){return Math.abs(row[ix]!)||1});
  for(i=0;i<p;i++){
    let piv=i;for(r=i+1;r<p;r++)if(Math.abs(M[r]![i]!)>Math.abs(M[piv]![i]!))piv=r;
    if(Math.abs(M[piv]![i]!)<1e-10*sc[i]!)return null;
    const tmp=M[i]!;M[i]=M[piv]!;M[piv]=tmp;const ts=sc[i]!;sc[i]=sc[piv]!;sc[piv]=ts;
    const d=M[i]![i]!;for(c=0;c<2*p;c++)M[i]![c]!/=d;
    for(r=0;r<p;r++)if(r!==i){const f=M[r]![i]!;if(f!==0)for(c=0;c<2*p;c++)M[r]![c]!-=f*M[i]![c]!}
  }
  const inv=M.map(function(row){return row.slice(p)}),xty=cols.map(function(col){let t=0;for(r=0;r<n;r++)t+=col[r]!*y[r]!;return t});
  const beta=inv.map(function(row){let t=0;for(j=0;j<p;j++)t+=row[j]!*xty[j]!;return t});
  const resid: number[]=[];let sse=0;
  for(r=0;r<n;r++){let fit=0;for(j=0;j<p;j++)fit+=beta[j]!*cols[j]![r]!;resid.push(y[r]!-fit);sse+=(y[r]!-fit)*(y[r]!-fit)}
  const my=smean(y);let sst=0;y.forEach(function(v){sst+=(v-my)*(v-my)});
  return{beta:beta,inv:inv,resid:resid,sse:sse,sst:sst,n:n,k:k};
}

export function stkLogit(xs: number[][], y: number[]): Logit | null {
  const n=y.length,k=xs.length,p=k+1,cols: number[][]=[];let i: number,j: number,r: number,c: number,it;
  const one=new Array<number>(n);for(r=0;r<n;r++)one[r]=1;cols.push(one);xs.forEach(function(x){cols.push(x)});
  let b=new Array<number>(p).fill(0),n1=0;y.forEach(function(v){n1+=v});
  if(n1===0||n1===n)return null;
  b[0]=Math.log(n1/(n-n1));
  function llF(bb: number[]){let t=0;for(r=0;r<n;r++){let z=0;for(j=0;j<p;j++)z+=bb[j]!*cols[j]![r]!;t+=y[r]!*z-(z>0?z+Math.log(1+Math.exp(-z)):Math.log(1+Math.exp(z)))}return t}
  function inv(H: number[][]){
    const M: number[][]=[];for(i=0;i<p;i++){M.push(new Array<number>(2*p));for(j=0;j<p;j++){M[i]![j]=H[i]![j]!;M[i]![p+j]=i===j?1:0}}
    const sc=M.map(function(row,ix){return Math.abs(row[ix]!)||1});
    for(i=0;i<p;i++){let piv=i;for(r=i+1;r<p;r++)if(Math.abs(M[r]![i]!)>Math.abs(M[piv]![i]!))piv=r;
      if(Math.abs(M[piv]![i]!)<1e-11*sc[i]!)return null;
      const tmp=M[i]!;M[i]=M[piv]!;M[piv]=tmp;const ts=sc[i]!;sc[i]=sc[piv]!;sc[piv]=ts;
      const d=M[i]![i]!;for(c=0;c<2*p;c++)M[i]![c]!/=d;
      for(r=0;r<p;r++)if(r!==i){const f=M[r]![i]!;if(f!==0)for(c=0;c<2*p;c++)M[r]![c]!-=f*M[i]![c]!}}
    return M.map(function(row){return row.slice(p)});
  }
  let cur=llF(b),conv=false,Hinv: number[][]|null=null;const pr=new Array<number>(n);
  for(it=0;it<100;it++){
    const g=new Array<number>(p).fill(0),H: number[][]=[];for(i=0;i<p;i++)H.push(new Array<number>(p).fill(0));
    for(r=0;r<n;r++){let z=0;for(j=0;j<p;j++)z+=b[j]!*cols[j]![r]!;const pp=1/(1+Math.exp(-z));pr[r]=pp;const w=pp*(1-pp),e=y[r]!-pp;
      for(i=0;i<p;i++){g[i]!+=cols[i]![r]!*e;for(j=0;j<=i;j++)H[i]![j]!+=cols[i]![r]!*cols[j]![r]!*w}}
    for(i=0;i<p;i++)for(j=i+1;j<p;j++)H[i]![j]=H[j]![i]!;
    const Hn=inv(H);if(!Hn){if(it===0)return{singular:true};return{sep:true}}Hinv=Hn;
    const step=Hinv.map(function(row){let t=0;for(j=0;j<p;j++)t+=row[j]!*g[j]!;return t});
    let s2=1,nb!: number[],nl!: number;
    for(let h=0;h<30;h++){nb=b.map(function(v,q){return v+s2*step[q]!});nl=llF(nb);if(isFinite(nl)&&nl>=cur-1e-12)break;s2/=2}
    const dl=Math.abs(nl-cur);b=nb;cur=nl;
    if(dl<1e-11*(1+Math.abs(cur))&&Math.max.apply(null,step.map(Math.abs))*s2<1e-8){conv=true;break}
  }
  for(r=0;r<n;r++){let z2=0;for(j=0;j<p;j++)z2+=b[j]!*cols[j]![r]!;pr[r]=1/(1+Math.exp(-z2))}
  const se=Hinv!.map(function(row,ix){return Math.sqrt(row[ix]!)});
  const sep=!conv||b.some(function(v){return Math.abs(v)>30})||se.some(function(v){return !isFinite(v)||v>500});
  const ll0=n1*Math.log(n1/n)+(n-n1)*Math.log((n-n1)/n);
  return{beta:b,se:se,inv:Hinv!,ll:cur,ll0:ll0,pr:pr,iter:it+1,conv:conv,sep:sep,n1:n1};
}
/* Area under the ROC curve from the fitted probabilities (Mann-Whitney form, ties count one half). */
export function stkAUC(pr: number[], y: number[]): number {
  const idx=pr.map(function(_,i){return i}).sort(function(a,b){return pr[a]!-pr[b]!}),rk=new Array<number>(pr.length);let i=0;
  while(i<idx.length){let j=i;while(j+1<idx.length&&pr[idx[j+1]!]===pr[idx[i]!])j++;const avg=(i+j)/2+1;for(let q=i;q<=j;q++)rk[idx[q]!]=avg;i=j+1}
  let n1=0,sr=0;y.forEach(function(v,t){if(v===1){n1++;sr+=rk[t]!}});const n0=y.length-n1;
  return(sr-n1*(n1+1)/2)/(n1*n0);
}

/* ---- power simulator (Version 44) ----
   A teaching simulation. Pretend two-group studies are drawn from normal populations with a chosen true effect d, each is
   tested with an independent-samples t-test, and the result is summarised. Seeded, so the same inputs give the same run.
   Output is only counts and a chart of observed effect sizes. No raw values are shown, kept or offered for download, and
   nothing from here can enter a Study record. The user chooses d and n only; there is no way to ask for a result. */
export function plRng(seed: number): () => number {let a=(seed>>>0)||1;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function plNorm(r: () => number): number {let u=0;while(u===0)u=r();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*r())}
export function plSim(d: number, n: number, k: number, seed: number): SimRun[] {
  const r=plRng(seed),res: SimRun[]=[];
  for(let s=0;s<k;s++){
    let m1=0,m2=0;const a=new Array<number>(n),b=new Array<number>(n);
    for(let i=0;i<n;i++){a[i]=plNorm(r);b[i]=plNorm(r)+d;m1+=a[i]!;m2+=b[i]!}
    m1/=n;m2/=n;
    let v1=0,v2=0;for(let i=0;i<n;i++){v1+=(a[i]!-m1)*(a[i]!-m1);v2+=(b[i]!-m2)*(b[i]!-m2)}
    const df=2*n-2,sp=Math.sqrt((v1+v2)/df),se=sp*Math.sqrt(2/n);
    const t=(m2-m1)/se,p=pFromT(Math.abs(t),df);
    res.push({d:(m2-m1)/sp,p:p,sig:p<0.05});
  }
  return res;
}

export function pwLogPois(j: number, mu: number): number {return -mu+j*Math.log(mu)-gammaln(j+1)}
export function pwNcChiSf(x: number, df: number, lam: number): number {
  if(x<=0)return 1;if(!(lam>0))return pFromChi(x,df);
  const mu=lam/2,j0=Math.floor(mu);let s=0,j,w,term;
  for(j=j0;j<j0+100000;j++){w=Math.exp(pwLogPois(j,mu));term=w*gammaq((df+2*j)/2,x/2);s+=term;if(j>mu&&w<1e-16)break}
  for(j=j0-1;j>=0;j--){w=Math.exp(pwLogPois(j,mu));term=w*gammaq((df+2*j)/2,x/2);s+=term;if(w<1e-16)break}
  return Math.min(1,s);
}
export function pwNcFSf(F: number, d1: number, d2: number, lam: number): number {
  if(F<=0)return 1;if(!(lam>0))return pFromF(F,d1,d2);
  const x=d1*F/(d1*F+d2),mu=lam/2,j0=Math.floor(mu);let s=0,j,w;
  for(j=j0;j<j0+100000;j++){w=Math.exp(pwLogPois(j,mu));s+=w*(1-betai(d1/2+j,d2/2,x));if(j>mu&&w<1e-16)break}
  for(j=j0-1;j>=0;j--){w=Math.exp(pwLogPois(j,mu));s+=w*(1-betai(d1/2+j,d2/2,x));if(w<1e-16)break}
  return Math.min(1,s);
}
/* P(T' <= t) for T' ~ noncentral t with df and noncentrality delta (Lenth 1989, AS 243). */
export function pwNctCdf(t: number, df: number, delta: number): number {
  if(df<=0)return NaN;if(delta===0)return t>=0?1-0.5*pFromT(t,df):0.5*pFromT(-t,df);
  const neg=t<0;if(neg){t=-t;delta=-delta}
  const x=t*t/(t*t+df),lam=delta*delta/2;let s=0,j;const j0=Math.floor(lam),lg=Math.log(lam>0?lam:1e-300);
  function wts(jj: number): [number, number] {const lp=-lam+jj*lg-gammaln(jj+1);return[Math.exp(lp),delta*Math.exp(-lam+jj*lg-gammaln(jj+1.5))/Math.SQRT2]}
  for(j=j0;j<j0+100000;j++){const w=wts(j);s+=w[0]*betai(j+0.5,df/2,x)+w[1]*betai(j+1,df/2,x);if(j>lam&&w[0]<1e-16&&Math.abs(w[1])<1e-16)break}
  for(j=j0-1;j>=0;j--){const w2=wts(j);s+=w2[0]*betai(j+0.5,df/2,x)+w2[1]*betai(j+1,df/2,x);if(w2[0]<1e-16&&Math.abs(w2[1])<1e-16)break}
  let cdf=stkNormCdf(-delta)+0.5*s;
  cdf=Math.min(1,Math.max(0,cdf));
  return neg?1-cdf:cdf;
}
export function pwChiCrit(alpha: number, df: number): number {let lo=0,hi=1000,i;while(pFromChi(hi,df)>alpha)hi*=2;for(i=0;i<200;i++){const m=(lo+hi)/2;if(pFromChi(m,df)>alpha)lo=m;else hi=m}return(lo+hi)/2}
/* Power of a t test with noncentrality delta, df, alpha and tails (1 or 2). */
export function pwPowerT(delta: number, df: number, alpha: number, tails: number): number {
  const tc=stkTCrit(df,tails===2?alpha:2*alpha);
  if(tails===2)return 1-pwNctCdf(tc,df,delta)+pwNctCdf(-tc,df,delta);
  return 1-pwNctCdf(tc,df,delta);
}
export function pwPowerF(f2: number, d1: number, d2: number, alpha: number, lamFactor: number): number {
  const Fc=stkFQuant(1-alpha,d1,d2);return pwNcFSf(Fc,d1,d2,f2*lamFactor);
}
/* spec: {test,alpha,tails,effect,k,p,df}, n: people (per group for 'ind') */
export function pwPower(spec: PowerSpec, n: number): number {
  const a=spec.alpha,e=spec.effect!,tl=spec.tails||2;
  switch(spec.test){
    case 'ind':{const N=2*n;if(n<2)return NaN;return pwPowerT(e*Math.sqrt(n/2),N-2,a,tl)}
    case 'paired':case 'one':{if(n<2)return NaN;return pwPowerT(e*Math.sqrt(n),n-1,a,tl)}
    case 'anova':{const k=spec.k!,N2=n*k;if(N2<=k)return NaN;return pwPowerF(e*e,k-1,N2-k,a,N2)}
    case 'regr':{const kp=spec.p!;if(n<=kp+1)return NaN;return pwPowerF(e,kp,n-kp-1,a,n)}
    case 'chisq':{const Xc=pwChiCrit(a,spec.df!);return pwNcChiSf(Xc,spec.df!,e*e*n)}
    case 'corr':{if(n<4)return NaN;const z=0.5*Math.log((1+e)/(1-e)),se=Math.sqrt(n-3),zc=stkQnorm(1-(tl===2?a/2:a));const m=z*se;return tl===2?(1-stkNormCdf(zc-m)+stkNormCdf(-zc-m)):1-stkNormCdf(zc-m)}
  }
  return NaN;
}
/* Smallest n with power >= target (n per group for 'ind'); null if above 100000. */
export function pwSolveN(spec: PowerSpec, target: number): number | null {
  let lo=2,hi=4,pw;
  while(hi<=200000){pw=pwPower(spec,hi);if(isFinite(pw)&&pw>=target)break;lo=hi;hi*=2}
  if(hi>200000)return null;
  while(hi-lo>1){const m=Math.floor((lo+hi)/2),pm=pwPower(spec,m);if(isFinite(pm)&&pm>=target)hi=m;else lo=m}
  const minN={ind:2,paired:3,one:3,anova:2,regr:spec.p!+2,chisq:2,corr:4}[spec.test];
  return Math.max(hi,minN);
}
/* Smallest effect with power >= target at the given n. */
export function pwSolveEffect(spec: PowerSpec, n: number, target: number): number | null {
  const hiMax={ind:5,paired:5,one:5,anova:3,regr:10,chisq:3,corr:0.9999}[spec.test];let lo=1e-6,hi=hiMax;const s2=Object.assign({},spec);let i;
  s2.effect=hi;const ph=pwPower(s2,n);if(!(ph>=target))return null;
  for(i=0;i<60;i++){const m=(lo+hi)/2;s2.effect=m;if(pwPower(s2,n)>=target)hi=m;else lo=m}
  return hi;
}

/* Simple effects after a significant interaction: one-way effect of one factor inside each level of the other, tested against the error term of the whole design. */
export function stkSimpleEffects(cellMap: Record<string, number[]>, la: number, lb: number, mse: number, dfe: number): { byA: Eff[]; byB: Eff[] } {
  function eff(ns: number[],ms: number[]): Eff {
    let N=0,sm=0,i;for(i=0;i<ns.length;i++){N+=ns[i]!;sm+=ns[i]!*ms[i]!}
    const mb=sm/N;let ss=0;for(i=0;i<ns.length;i++)ss+=ns[i]!*(ms[i]!-mb)*(ms[i]!-mb);
    const df=ns.length-1,F=(ss/df)/mse;return{ss:ss,df:df,F:F,p:pFromF(F,df,dfe)};
  }
  const byA: Eff[]=[],byB: Eff[]=[];let i,j;
  for(i=0;i<la;i++){const ns: number[]=[],ms: number[]=[];for(j=0;j<lb;j++){const g=cellMap[i+'|'+j]!;ns.push(g.length);ms.push(smean(g))}byA.push(eff(ns,ms))}
  for(j=0;j<lb;j++){const ns2: number[]=[],ms2: number[]=[];for(i=0;i<la;i++){const g2=cellMap[i+'|'+j]!;ns2.push(g2.length);ms2.push(smean(g2))}byB.push(eff(ns2,ms2))}
  return{byA:byA,byB:byB};
}
export function smean(a: number[]): number {return a.reduce((s,v)=>s+v,0)/a.length}
export function svar(a: number[]): number {const m=smean(a);return a.reduce((s,v)=>s+(v-m)*(v-m),0)/(a.length-1)}
export function ssd(a: number[]): number {return Math.sqrt(svar(a))}
export function smedian(a: number[]): number {const s=a.slice().sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]!:(s[n/2-1]!+s[n/2]!)/2}
export function ranks(a: number[]): number[] { /* average ranks, ties split evenly */
  const idx=a.map((v,i)=>i).sort((i,j)=>a[i]!-a[j]!);
  const r=new Array<number>(a.length);let i=0;
  while(i<idx.length){
    let j=i;while(j+1<idx.length&&a[idx[j+1]!]===a[idx[i]!])j++;
    const avg=(i+j)/2+1;
    for(let k=i;k<=j;k++)r[idx[k]!]=avg;
    i=j+1;
  }
  return r;
}

/* ---- tests added 2026-10-07: Kruskal-Wallis, Spearman, Cronbach's alpha and McDonald's omega, Welch t ---- */
export function stkTCrit(df: number, alpha: number): number {let lo=0,hi=1000;for(let i=0;i<200;i++){const m=(lo+hi)/2;if(pFromT(m,df)>alpha)lo=m;else hi=m}return(lo+hi)/2}
export function stkFQuant(q: number, d1: number, d2: number): number {let lo=0,hi=1e6;for(let i=0;i<300;i++){const m=(lo+hi)/2;if(1-pFromF(m,d1,d2)<q)lo=m;else hi=m}return(lo+hi)/2}
export function stkTieTerm(all: number[]): number {const a=all.slice().sort((x,y)=>x-y);let T=0,i=0;while(i<a.length){let j=i;while(j+1<a.length&&a[j+1]===a[i])j++;const t=j-i+1;T+=t*t*t-t;i=j+1}return T}
export function stkHolm(ps: number[]): number[] {const m=ps.length,idx=ps.map((_,i)=>i).sort((a,b)=>ps[a]!-ps[b]!),out=new Array<number>(m);let run=0;idx.forEach((i,r)=>{run=Math.max(run,Math.min(1,(m-r)*ps[i]!));out[i]=run});return out}
export function stkKruskal(groups: number[][]): Kruskal {
  const all=([] as number[]).concat(...groups),N=all.length,k=groups.length,r=ranks(all);
  let pos=0,sm=0;const mr: number[]=[];
  groups.forEach(g=>{let R=0;for(let i=0;i<g.length;i++)R+=r[pos+i]!;pos+=g.length;mr.push(R/g.length);sm+=R*R/g.length});
  let H=12/(N*(N+1))*sm-3*(N+1);const T=stkTieTerm(all),C=1-T/(N*N*N-N);
  if(C>0)H/=C;
  return{H:H,df:k-1,p:pFromChi(H,k-1),N:N,k:k,meanRanks:mr,eps2:H/(N-1),T:T};
}
export function stkDunn(groups: number[][], kw: Kruskal): DunnPair[] {
  const N=kw.N,vt=N*(N+1)/12-kw.T/(12*(N-1)),pairs: DunnPair[]=[],ps: number[]=[];
  for(let i=0;i<groups.length;i++)for(let j=i+1;j<groups.length;j++){
    const z=(kw.meanRanks[i]!-kw.meanRanks[j]!)/Math.sqrt(vt*(1/groups[i]!.length+1/groups[j]!.length));
    const p=pFromZ(z);pairs.push({i:i,j:j,z:z,p:p} as DunnPair);ps.push(p);
  }
  const adj=stkHolm(ps);pairs.forEach((q,x)=>{q.padj=adj[x]!});return pairs;
}
export function stkSpearman(xs: number[], ys: number[]): Spearman {
  const rx=ranks(xs),ry=ranks(ys),n=xs.length,mx=smean(rx),my=smean(ry);
  let sxy=0,sxx=0,syy=0;
  for(let i=0;i<n;i++){sxy+=(rx[i]!-mx)*(ry[i]!-my);sxx+=(rx[i]!-mx)*(rx[i]!-mx);syy+=(ry[i]!-my)*(ry[i]!-my)}
  const r=sxy/Math.sqrt(sxx*syy),df=n-2;
  const p=Math.abs(r)>=1?0:pFromT(r*Math.sqrt(df/(1-r*r)),df);
  const z=Math.atanh(Math.max(-0.999999,Math.min(0.999999,r))),se=Math.sqrt((1+r*r/2)/(n-3));
  return{rho:r,n:n,df:df,p:p,lo:Math.tanh(z-1.959964*se),hi:Math.tanh(z+1.959964*se)};
}
export function stkCorrMat(X: number[][]): number[][] | null {
  const n=X.length,k=X[0]!.length,cols: number[][]=[];
  for(let j=0;j<k;j++)cols.push(X.map(r=>r[j]!));
  const m=cols.map(smean),sd=cols.map(c=>Math.sqrt(c.reduce((s,v)=>s+(v-smean(c))*(v-smean(c)),0)/(n-1)));
  if(sd.some(v=>!(v>0)))return null;
  const R: number[][]=[];
  for(let a=0;a<k;a++){R.push([]);for(let b=0;b<k;b++){
    if(a===b){R[a]!.push(1);continue}
    let s=0;for(let i=0;i<n;i++)s+=(cols[a]![i]!-m[a]!)*(cols[b]![i]!-m[b]!);
    R[a]!.push(s/((n-1)*sd[a]!*sd[b]!));
  }}
  return R;
}
export function stkOmega(R: number[][]): Omega | null {
  const k=R.length;
  let h=R.map((row,i)=>Math.max.apply(null,row.filter((_,j)=>j!==i).map(Math.abs)));
  let v=new Array<number>(k).fill(1/Math.sqrt(k)),l=new Array<number>(k).fill(0);
  for(let it=0;it<500;it++){
    const A=R.map((row,i)=>row.map((x,j)=>i===j?h[i]!:x));
    let ev=0;
    for(let q=0;q<300;q++){
      const w=A.map((row,i)=>row.reduce((sm,a,j)=>sm+a*v[j]!,0)+k*v[i]!);
      const nr=Math.sqrt(w.reduce((sm,a)=>sm+a*a,0));if(!(nr>0))return null;
      const nv=w.map(a=>a/nr);let d=0;for(let i=0;i<k;i++)d=Math.max(d,Math.abs(nv[i]!-v[i]!));
      v=nv;ev=nr-k;if(d<1e-12)break;
    }
    if(!(ev>0))return null;
    const sg=v.reduce((sm,a)=>sm+a,0)<0?-1:1;
    l=v.map(a=>sg*a*Math.sqrt(ev));
    const nh=l.map(a=>Math.min(a*a,0.995));let dd=0;for(let i=0;i<k;i++)dd=Math.max(dd,Math.abs(nh[i]!-h[i]!));
    h=nh;if(dd<1e-9)break;
  }
  const sl=l.reduce((sm,a)=>sm+a,0),uni=h.reduce((sm,a)=>sm+(1-a),0);
  return{omega:sl*sl/(sl*sl+uni),loadings:l};
}
export function stkAlpha(X: number[][]): { alpha: number; n: number; k: number } {
  const n=X.length,k=X[0]!.length;let sv=0;
  for(let j=0;j<k;j++)sv+=svar(X.map(r=>r[j]!));
  const vt=svar(X.map(r=>r.reduce((a,b)=>a+b,0)));
  return{alpha:k/(k-1)*(1-sv/vt),n:n,k:k};
}
export function stkRng(seed: number): () => number {return function(){seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
export function stkOmegaBoot(X: number[][], B: number): [number, number] | null {
  const n=X.length,rnd=stkRng(12345),out: number[]=[];
  for(let b=0;b<B;b++){
    const S: number[][]=[];for(let i=0;i<n;i++)S.push(X[Math.floor(rnd()*n)]!);
    const R=stkCorrMat(S);if(!R)continue;
    const o=stkOmega(R);if(o&&isFinite(o.omega))out.push(o.omega);
  }
  out.sort((a,b)=>a-b);
  if(out.length<50)return null;
  return[out[Math.floor(0.025*(out.length-1))]!,out[Math.ceil(0.975*(out.length-1))]!];
}

/* ---- batch two helpers (2026-10-07): studentized range, Welch ANOVA, Games-Howell, Fisher exact, exact binomial ---- */
export const STK_GL=(function(n: number){const x: number[]=[],w: number[]=[];for(let i=0;i<n;i++){let z=Math.cos(Math.PI*(i+0.75)/(n+0.5)),pp=0;for(let it=0;it<100;it++){let p1=1,p2=0;for(let j=1;j<=n;j++){const p3=p2;p2=p1;p1=((2*j-1)*z*p2-(j-1)*p3)/j}pp=n*(z*p1-p2)/(z*z-1);const dz=p1/pp;z-=dz;if(Math.abs(dz)<1e-15)break}x.push(z);w.push(2/((1-z*z)*pp*pp))}return{x:x,w:w}})(12);
export function stkGL(f: (z: number) => number, a: number, b: number, segs: number): number {let tot=0;const h=(b-a)/segs;for(let s2=0;s2<segs;s2++){const lo=a+s2*h,mid=lo+h/2,half=h/2;for(let i=0;i<STK_GL.x.length;i++)tot+=STK_GL.w[i]!*half*f(mid+half*STK_GL.x[i]!)}return tot}
export function stkPhi(z: number): number {const t=0.5*gammaq(0.5,z*z/2);return z>=0?1-t:t}
export function stkPtukey(q: number, k: number, v: number): number {
  if(!(q>0))return 0;
  const sd=Math.sqrt(0.5/v),lo=Math.max(0,1-9*sd),hi=1+11*sd+(v<5?4:0);
  const lc=0.5*v*Math.log(v)-gammaln(v/2)-(v/2-1)*Math.log(2);
  const W=(w: number)=>stkGL(z=>{const d=stkPhi(z)-stkPhi(z-w);return k*Math.exp(-z*z/2)/2.5066282746310002*Math.pow(Math.max(d,0),k-1)},-8,8+w,Math.max(4,Math.ceil((16+w)/2.5)));
  const r=stkGL(s2=>{if(s2<=0)return 0;return Math.exp(lc+(v-1)*Math.log(s2)-v*s2*s2/2)*W(q*s2)},lo,hi,14);
  return Math.min(1,Math.max(0,r));
}
export function stkQtukey(pr: number, k: number, v: number): number {
  let a=0.5,b=4,fa=stkPtukey(a,k,v)-pr,fb=stkPtukey(b,k,v)-pr;
  while(fb<0&&b<400){a=b;fa=fb;b*=2;fb=stkPtukey(b,k,v)-pr}
  let side=0;
  for(let i=0;i<60;i++){
    const c=(a*fb-b*fa)/(fb-fa),fc=stkPtukey(c,k,v)-pr;
    if(Math.abs(fc)<1e-12||Math.abs(b-a)<1e-10)return c;
    if(fc*fb>0){b=c;fb=fc;if(side===-1)fa/=2;side=-1}else{a=c;fa=fc;if(side===1)fb/=2;side=1}
  }
  return(a+b)/2;
}
export function stkWelchAnova(groups: number[][]): Welch | null {
  const k=groups.length,n=groups.map(g=>g.length),m=groups.map(smean),v=groups.map(svar);
  if(v.some(x=>!(x>0)))return null;
  const w=n.map((ni,i)=>ni/v[i]!),W=w.reduce((a,b)=>a+b,0),mw=w.reduce((a,wi,i)=>a+wi*m[i]!,0)/W;
  const A=w.reduce((a,wi,i)=>a+wi*(m[i]!-mw)*(m[i]!-mw),0)/(k-1);
  const L=w.reduce((a,wi,i)=>a+Math.pow(1-wi/W,2)/(n[i]!-1),0);
  const B=1+2*(k-2)/(k*k-1)*L,F=A/B,df1=k-1,df2=(k*k-1)/(3*L);
  const all=([] as number[]).concat(...groups),N=all.length,gm=smean(all);let ssb=0,ssw=0;
  groups.forEach((g,i)=>{ssb+=n[i]!*(m[i]!-gm)*(m[i]!-gm);g.forEach(x=>ssw+=(x-m[i]!)*(x-m[i]!))});
  const msw=ssw/(N-k),om2=Math.max(0,(ssb-(k-1)*msw)/(ssb+ssw+msw));
  return{F:F,df1:df1,df2:df2,p:pFromF(F,df1,df2),omega2:om2,N:N,k:k};
}
export function stkGamesHowell(groups: number[][]): GamesHowellPair[] {
  const k=groups.length,out: GamesHowellPair[]=[];
  for(let i=0;i<k;i++)for(let j=i+1;j<k;j++){
    const a=groups[i]!,b=groups[j]!,va=svar(a)/a.length,vb=svar(b)/b.length,se=Math.sqrt(va+vb);
    const df=Math.pow(va+vb,2)/(va*va/(a.length-1)+vb*vb/(b.length-1)),diff=smean(a)-smean(b),q=Math.abs(diff)/se*Math.SQRT2;
    const p=1-stkPtukey(q,k,df),qc=stkQtukey(0.95,k,df)/Math.SQRT2*se;
    out.push({i:i,j:j,diff:diff,se:se,df:df,q:q,p:Math.max(0,p),lo:diff-qc,hi:diff+qc});
  }
  return out;
}
export function stkLogChoose(n: number, r: number): number {return gammaln(n+1)-gammaln(r+1)-gammaln(n-r+1)}
/* Fisher-Freeman-Halton exact test for an r x c table of counts. Enumerates every table with the same row and column totals
   and adds up the probabilities of those no more likely than the observed one. Returns null when there are too many tables. */
export function stkFisherRC(table: number[][], limit?: number): FisherRC | null {
  limit=limit||30000000;
  let T=table.map(function(r){return r.slice()});
  if(T.length>T[0]!.length){const tr: number[][]=[];for(let j=0;j<T[0]!.length;j++){tr.push(T.map(function(r){return r[j]!}))}T=tr}
  const r=T.length,c=T[0]!.length,rs=T.map(function(row){return row.reduce(function(a,b){return a+b},0)}),cs: number[]=[];
  for(let j2=0;j2<c;j2++){let t=0;for(let i=0;i<r;i++)t+=T[i]![j2]!;cs.push(t)}
  const N=rs.reduce(function(a,b){return a+b},0),lf=[0];for(let q=1;q<=N;q++)lf.push(lf[q-1]!+Math.log(q));
  let cst=-lf[N]!;rs.forEach(function(x){cst+=lf[x]!});cs.forEach(function(x){cst+=lf[x]!});
  let acc=0;T.forEach(function(row){row.forEach(function(v){acc+=lf[v]!})});
  const obs=cst-acc;let pv=0,tot=0,cnt=0,over=false;
  function rec(i: number,rem: number[],sumLf: number){
    if(over)return;
    if(i===r-1){
      let s2=sumLf;for(let j3=0;j3<c;j3++)s2+=lf[rem[j3]!]!;
      const l=cst-s2,pr=Math.exp(l);cnt++;tot+=pr;if(l<=obs+1e-7)pv+=pr;
      if(cnt>limit!)over=true;return;
    }
    const row=new Array<number>(c);
    (function fill(j4: number,left: number,sl: number){
      if(over)return;
      if(j4===c-1){
        if(left>rem[j4]!)return;
        row[j4]=left;const nrem=new Array<number>(c);for(let z=0;z<c;z++)nrem[z]=rem[z]!-row[z]!;
        rec(i+1,nrem,sl+lf[left]!);return;
      }
      const mx=Math.min(left,rem[j4]!);
      for(let x=0;x<=mx;x++){row[j4]=x;fill(j4+1,left-x,sl+lf[x]!)}
    })(0,rs[i]!,sumLf);
  }
  rec(0,cs.slice(),0);
  if(over)return null;
  return{p:Math.min(1,pv),tables:cnt,total:tot};
}
export function stkFisher2x2(a: number, b: number, c: number, d: number): { p: number; or: number } {
  const r1=a+b,r2=c+d,c1=a+c,N=r1+r2,lo=Math.max(0,c1-r2),hi=Math.min(r1,c1);
  const lp=(x: number)=>stkLogChoose(r1,x)+stkLogChoose(r2,c1-x)-stkLogChoose(N,c1),obs=lp(a);let p=0;
  for(let x=lo;x<=hi;x++){const l=lp(x);if(l<=obs+1e-7)p+=Math.exp(l)}
  return{p:Math.min(1,p),or:(b*c)===0?(a*d===0?NaN:Infinity):(a*d)/(b*c)};
}
/* Exact tests for small samples (as R's wilcox.test does when there are no tied scores and fewer than 50 per group).
   Counts are built by addition only, so no precision is lost to cancellation. */
export function stkExactMW(n1: number, n2: number, U: number): number {
  /* number of arrangements with Mann-Whitney U = u, from f(m,n,u) = f(m-1,n,u-n) + f(m,n-1,u) */
  let prev: number[][]=[];
  for(let j=0;j<=n2;j++)prev.push([1]);              /* row i = 0 */
  for(let i=1;i<=n1;i++){
    const row: number[][]=[[1]];                      /* j = 0 */
    for(let j=1;j<=n2;j++){
      const len=i*j+1,a=new Array<number>(len).fill(0),up=prev[j]!,left=row[j-1]!;
      for(let u=0;u<len;u++){
        let v=0;
        if(u>=j&&u-j<up.length)v+=up[u-j]!;
        if(u<left.length)v+=left[u]!;
        a[u]=v;
      }
      row.push(a);
    }
    prev=row;
  }
  const f=prev[n2]!;let tot=0,cum=0;
  for(let u=0;u<f.length;u++){tot+=f[u]!;if(u<=U+1e-9)cum+=f[u]!}
  return Math.min(1,2*cum/tot);
}
export function stkExactSR(n: number, W: number): number {
  const max=n*(n+1)/2,c=new Array<number>(max+1).fill(0);c[0]=1;
  for(let r=1;r<=n;r++)for(let sm=max;sm>=r;sm--)c[sm]!+=c[sm-r]!;
  let cum=0;for(let sm=0;sm<=max;sm++){if(sm<=W+1e-9)cum+=c[sm]!}
  return Math.min(1,2*cum/Math.pow(2,n));
}
export function stkBinomTwo(x: number, n: number, pi: number): number {
  const lp=(i: number)=>stkLogChoose(n,i)+i*Math.log(pi)+(n-i)*Math.log(1-pi),obs=lp(x);let p=0;
  for(let i=0;i<=n;i++){const l=lp(i);if(l<=obs+1e-7)p+=Math.exp(l)}
  return Math.min(1,p);
}
