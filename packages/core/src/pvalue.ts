/* v1's distribution core: gammaln, betai, gammaq, erf, normalCDF, pFromT, pFromF, pFromChi and pFromZ, with the three helpers _betacf, _gser and _gcf that they call (index.html:8633-8690).
   pFromT, pFromF, pFromChi and pFromZ are the p values of v1's t, F, chi-square and z statistics; its power, studentized-range and exact-test code (9044-9269) reuses gammaln, betai and gammaq.
   The arithmetic is v1's as v1 wrote it, line for line: the same operation order, literal coefficients, loop bounds (MAXIT and ITMAX 200),
   tolerances (EPS 3e-9, FPMIN 1e-30) and early returns, so the functions return v1's doubles to the last bit; test/golden/pvalue.test.ts compares them with toBe.
   What differs from v1's text is only what TypeScript and this package's lint need: parameter and return types; `export` (not on _betacf, _gser and _gcf); `const` or `let` where v1 wrote `var`
   (the no-var rule), a `var` list that mixes bindings kept and bindings reassigned being split in two statements in the same order; and one `!` on cof[j] (noUncheckedIndexedAccess).
   pFromF is `1 - betai(...)`, so a right tail below about 1e-16 comes out as exactly 0 (register row F5). */
export function gammaln(x: number): number {
  const cof=[76.18009172947146,-86.50532032941677,24.01409824083091,-1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y=x,tmp=x+5.5;tmp-=(x+0.5)*Math.log(tmp);
  let ser=1.000000000190015;
  for(let j=0;j<6;j++){y+=1;ser+=cof[j]!/y}
  return -tmp+Math.log(2.5066282746310005*ser/x);
}
function _betacf(x: number, a: number, b: number): number {
  const MAXIT=200,EPS=3e-9,FPMIN=1e-30;
  const qab=a+b,qap=a+1,qam=a-1;let c=1,d=1-qab*x/qap;
  if(Math.abs(d)<FPMIN)d=FPMIN;d=1/d;let h=d;
  for(let m=1;m<=MAXIT;m++){
    const m2=2*m;let aa=m*(b-m)*x/((qam+m2)*(a+m2));
    d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;h*=d*c;
    aa=-(a+m)*(qab+m)*x/((a+m2)*(qap+m2));
    d=1+aa*d;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=1+aa/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;const del=d*c;h*=del;
    if(Math.abs(del-1)<EPS)break;
  }
  return h;
}
export function betai(a: number, b: number, x: number): number {
  if(x<=0)return 0;if(x>=1)return 1;
  const bt=Math.exp(gammaln(a+b)-gammaln(a)-gammaln(b)+a*Math.log(x)+b*Math.log(1-x));
  return x<(a+1)/(a+b+2)?bt*_betacf(x,a,b)/a:1-bt*_betacf(1-x,b,a)/b;
}
function _gser(a: number, x: number): number {
  const ITMAX=200,EPS=3e-9;if(x<=0)return 0;
  let ap=a,sum=1/a,del=sum;
  for(let n=1;n<=ITMAX;n++){ap+=1;del*=x/ap;sum+=del;if(Math.abs(del)<Math.abs(sum)*EPS)break}
  return sum*Math.exp(-x+a*Math.log(x)-gammaln(a));
}
function _gcf(a: number, x: number): number {
  const ITMAX=200,EPS=3e-9,FPMIN=1e-30;
  let b=x+1-a,c=1/FPMIN,d=1/b,h=d;
  for(let i=1;i<=ITMAX;i++){
    const an=-i*(i-a);b+=2;d=an*d+b;if(Math.abs(d)<FPMIN)d=FPMIN;
    c=b+an/c;if(Math.abs(c)<FPMIN)c=FPMIN;
    d=1/d;const del=d*c;h*=del;if(Math.abs(del-1)<EPS)break;
  }
  return Math.exp(-x+a*Math.log(x)-gammaln(a))*h;
}
export function gammaq(a: number, x: number): number {return x<a+1?1-_gser(a,x):_gcf(a,x)}
export function erf(x: number): number {
  const sign=x<0?-1:1;x=Math.abs(x);
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const t=1/(1+p*x);
  const y=1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-x*x);
  return sign*y;
}
export function normalCDF(z: number): number {return 0.5*(1+erf(z/Math.sqrt(2)))}
export function pFromT(t: number, df: number): number {return betai(df/2,0.5,df/(df+t*t))}                          /* two-tailed */
export function pFromF(f: number, df1: number, df2: number): number {if(f<=0)return 1;const x=df1*f/(df1*f+df2);return 1-betai(df1/2,df2/2,x)} /* one-tailed */
export function pFromChi(chi2: number, df: number): number {return gammaq(df/2,chi2/2)}
export function pFromZ(z: number): number {z=Math.abs(z);return z===0?1:gammaq(0.5,z*z/2)}                            /* two-tailed */
