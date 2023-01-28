import { defer, Observable } from 'rxjs';
import { finalize, first, share, take } from 'rxjs/operators';

/**
 * https://stackoverflow.com/a/48983205/532695
 *
 * Example
 import {from} from 'rxjs/observable/from';

 from([1, 2, 3])
 .pipe(doOnSubscribe(() => console.log('subscribed to stream')))
 .subscribe(x => console.log(x), null, () => console.log('completed'));
 */

export function doOnSubscribe<T>(onSubscribe: () => void): (source: Observable<T>) => Observable<T> {
  return function inner(source: Observable<T>): Observable<T> {
    return defer(() => {
      onSubscribe();
      return source;
    });
  };
}

/***
 * Example
 import {from} from 'rxjs/observable/from';

 from([1, 2, 3])
 .take(1)
 .pipe(doOnUnsubscribe(() => console.log('unsubscribed from stream')))
 .subscribe(x => console.log(x), null, () => console.log('completed'));
 */

export function doOnUnsubscribe<T>(onUnsubscribe: () => void): (source: Observable<T>) => Observable<T> {
  return function inner(source: Observable<T>): Observable<T> {
    // Possible shorter alternative: return source.pipe(finalize(onUnsubscribe), share()); see https://github.com/ReactiveX/rxjs/issues/3786#issuecomment-394523704
    return new Observable((subscriber) => {
      const subscription = source.subscribe(
        (value) => {
          subscriber.next(value);
        },
        (value) => {
          subscriber.error(value);
        },
        () => {
          subscriber.complete();
        }
      );

      return () => {
        subscription.unsubscribe();
        onUnsubscribe();
      };
    });
  };
}
